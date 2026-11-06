create extension if not exists pgcrypto;

-- USER PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'customer'
    check (role in ('customer', 'admin')),
  created_at timestamptz default now()
);

-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  venue text not null,
  event_date timestamptz not null,
  image_url text,
  status text default 'upcoming'
    check (status in ('upcoming', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

-- TICKET CATEGORIES
create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  quantity integer not null check (quantity >= 0),
  available integer not null check (available >= 0),
  created_at timestamptz default now()
);

-- BOOKINGS
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  event_id uuid references public.events(id),
  ticket_type_id uuid references public.ticket_types(id),
  quantity integer not null check (quantity > 0),
  total_amount numeric(12,2) not null,
  payment_method text,
  payment_reference text,
  payment_status text not null default 'pending_payment'
    check (payment_status in (
      'pending_payment', 'paid', 'rejected', 'refunded'
    )),
  booking_status text not null default 'pending'
    check (booking_status in (
      'pending', 'confirmed', 'cancelled'
    )),
  created_at timestamptz default now()
);

-- ISSUED TICKETS
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  user_id uuid references auth.users(id),
  event_id uuid references public.events(id),
  qr_token uuid unique not null default gen_random_uuid(),
  checked_in boolean default false,
  checked_in_at timestamptz,
  created_at timestamptz default now()
);

-- AUTOMATIC PROFILE CREATION
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        phone = excluded.phone;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.bookings enable row level security;
alter table public.tickets enable row level security;

-- PUBLIC EVENT ACCESS
create policy "Public can view events"
on public.events for select
using (status = 'upcoming' or status = 'completed');

create policy "Public can view ticket types"
on public.ticket_types for select
using (true);

-- CUSTOMER ACCESS
create policy "Users view own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id and role = 'customer');

create policy "Users view own bookings"
on public.bookings for select
using (auth.uid() = user_id);

create policy "Users view own tickets"
on public.tickets for select
using (auth.uid() = user_id);

-- NOTE:
-- Booking creation, payment approval, ticket issuance,
-- and check-in will be performed through secured
-- server-side functions, not direct public table writes.

-- ADMIN CHECK
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- Admins can manage events and ticket categories.
create policy "Admins manage events"
on public.events for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage ticket types"
on public.ticket_types for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins view all bookings"
on public.bookings for select
using (public.is_admin());

create policy "Admins manage bookings"
on public.bookings for update
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage tickets"
on public.tickets for all
using (public.is_admin())
with check (public.is_admin());

-- ATOMIC BOOKING CREATION
create or replace function public.create_booking(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.ticket_types%rowtype;
  v_booking_id uuid;
  v_rowcount integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  if p_payment_method is null or p_payment_method not in ('mpesa', 'bank', 'card') then
    raise exception 'Invalid payment method';
  end if;

  if exists (
    select 1
    from public.events
    where id = p_event_id
      and status <> 'upcoming'
  ) then
    raise exception 'Event is not currently accepting bookings';
  end if;

  select *
  into v_ticket
  from public.ticket_types
  where id = p_ticket_type_id
    and event_id = p_event_id
  for update;

  if not found then
    raise exception 'Ticket category not found';
  end if;

  if v_ticket.available < p_quantity then
    raise exception 'Not enough tickets available';
  end if;

  update public.ticket_types
  set available = available - p_quantity
  where id = p_ticket_type_id
    and available >= p_quantity;

  get diagnostics v_rowcount = row_count;

  if v_rowcount <> 1 then
    raise exception 'Ticket inventory is no longer available';
  end if;

  insert into public.bookings (
    user_id, event_id, ticket_type_id, quantity,
    total_amount, payment_method, payment_reference
  )
  values (
    v_user_id, p_event_id, p_ticket_type_id, p_quantity,
    v_ticket.price * p_quantity,
    p_payment_method, p_payment_reference
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

-- Only the backend service role should call this function.
create or replace function public.admin_confirm_booking(
  p_booking_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  i integer;
begin
  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.payment_status <> 'pending_payment' then
    raise exception 'Booking is no longer awaiting payment';
  end if;

  if p_approved then
    update public.bookings
    set payment_status = 'paid',
        booking_status = 'confirmed',
        payment_reviewed_at = now(),
        reviewed_at = now(),
        payment_review_note = coalesce(payment_review_note, 'Approved by administrator.')
    where id = p_booking_id;

    for i in 1..v_booking.quantity loop
      insert into public.tickets (
        booking_id, user_id, event_id
      )
      values (
        v_booking.id, v_booking.user_id, v_booking.event_id
      );
    end loop;
  else
    update public.bookings
    set payment_status = 'rejected',
        booking_status = 'cancelled',
        payment_reviewed_at = now(),
        reviewed_at = now(),
        payment_review_note = coalesce(payment_review_note, 'Rejected by administrator.')
    where id = p_booking_id;

    update public.ticket_types
    set available = available + v_booking.quantity
    where id = v_booking.ticket_type_id;
  end if;
end;
$$;

-- Do not expose the privileged approval function to users.
revoke all on function public.admin_confirm_booking(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.admin_confirm_booking(uuid, boolean)
to service_role;

-- Authenticated customers can create bookings only through the
-- controlled booking function.
revoke all on function public.create_booking(uuid, uuid, integer, text, text)
from public, anon;

grant execute on function public.create_booking(uuid, uuid, integer, text, text)
to authenticated;
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
ON public.bookings(payment_status);

CREATE INDEX IF NOT EXISTS idx_bookings_payment_reference
ON public.bookings(payment_reference);
-- Ensure each ticket has a unique QR token.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_qr_token_unique
ON public.tickets (qr_token);

-- Improve ticket lookup performance.
CREATE INDEX IF NOT EXISTS
tickets_event_checkin_idx
ON public.tickets(event_id, checked_in);

CREATE INDEX IF NOT EXISTS
tickets_booking_idx
ON public.tickets(booking_id);

-- Check-in audit history.
CREATE TABLE IF NOT EXISTS public.ticket_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id),
  event_id UUID NOT NULL REFERENCES public.events(id),
  checked_by UUID NOT NULL REFERENCES public.profiles(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result TEXT NOT NULL DEFAULT 'accepted'
    CHECK (result IN ('accepted', 'duplicate', 'invalid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_checkins ENABLE ROW LEVEL SECURITY;

-- Only administrators can view the audit history.
CREATE POLICY "Admins view ticket checkins"
ON public.ticket_checkins
FOR SELECT
TO authenticated
USING (public.is_admin());

REVOKE ALL ON public.ticket_checkins FROM anon;
GRANT SELECT ON public.ticket_checkins TO authenticated;
CREATE OR REPLACE FUNCTION public.verify_and_checkin_ticket(
  p_qr_token UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket RECORD;
BEGIN
  SELECT
    t.id,
    t.event_id,
    t.checked_in,
    b.payment_status,
    b.booking_status,
    e.title AS event_title
  INTO v_ticket
  FROM public.tickets t
  JOIN public.bookings b ON b.id = t.booking_id
  JOIN public.events e ON e.id = t.event_id
  WHERE t.qr_token = p_qr_token
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'invalid',
      'message', 'Ticket not found.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_admin_id
      AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator authorization required.';
  END IF;

  IF v_ticket.payment_status <> 'paid'
     OR v_ticket.booking_status <> 'confirmed' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'unpaid',
      'message', 'Booking is not confirmed.'
    );
  END IF;

  IF v_ticket.checked_in THEN
    INSERT INTO public.ticket_checkins (
      ticket_id, event_id, checked_by, result
    ) VALUES (
      v_ticket.id, v_ticket.event_id, p_admin_id, 'duplicate'
    );

    RETURN jsonb_build_object(
      'valid', false,
      'status', 'already_used',
      'message', 'This ticket has already been scanned.',
      'event_title', v_ticket.event_title
    );
  END IF;

  UPDATE public.tickets
  SET
    checked_in = TRUE,
    checked_in_at = NOW()
  WHERE id = v_ticket.id;

  INSERT INTO public.ticket_checkins (
    ticket_id, event_id, checked_by, result
  ) VALUES (
    v_ticket.id, v_ticket.event_id, p_admin_id, 'accepted'
  );

  RETURN jsonb_build_object(
    'valid', true,
    'status', 'accepted',
    'message', 'Ticket accepted. Welcome!',
    'ticket_id', v_ticket.id,
    'event_title', v_ticket.event_title,
    'checked_in_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION
public.verify_and_checkin_ticket(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.verify_and_checkin_ticket(UUID, UUID)
TO service_role;
