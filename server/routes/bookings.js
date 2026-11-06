const express = require("express");
const router = express.Router();

const { supabaseAdmin } = require("../supabase");
const { requireAuth } = require("../middleware/auth");

async function hydrateBooking(booking) {
    const [{ data: profile }, { data: event }, { data: ticketType }] = await Promise.all([
        supabaseAdmin
            .from("profiles")
            .select("id, full_name, phone")
            .eq("id", booking.user_id)
            .maybeSingle(),
        supabaseAdmin
            .from("events")
            .select("id, title, venue, event_date")
            .eq("id", booking.event_id)
            .maybeSingle(),
        supabaseAdmin
            .from("ticket_types")
            .select("id, name, price")
            .eq("id", booking.ticket_type_id)
            .maybeSingle()
    ]);

    return {
        id: booking.id,
        event_id: booking.event_id,
        ticket_type_id: booking.ticket_type_id,
        quantity: booking.quantity,
        total_amount: booking.total_amount,
        payment_method: booking.payment_method,
        payment_status: booking.payment_status,
        booking_status: booking.booking_status,
        payment_reference: booking.payment_reference,
        created_at: booking.created_at,
        customer: profile || null,
        events: event || null,
        ticket_types: ticketType || null
    };
}

router.get("/my", requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("bookings")
            .select("id, user_id, event_id, ticket_type_id, quantity, total_amount, payment_status, booking_status, payment_method, payment_reference, created_at")
            .eq("user_id", req.user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const bookings = await Promise.all((data || []).map(hydrateBooking));

        res.json({ bookings });
    } catch (error) {
        console.error("Customer bookings lookup failed:", error);
        res.status(500).json({ error: "Could not load your bookings." });
    }
});

module.exports = router;
