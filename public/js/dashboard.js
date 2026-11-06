const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);
const API = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL ? window.APP_CONFIG.API_BASE_URL : "";

const bookingList = document.getElementById("bookingList");
const ticketList = document.getElementById("ticketList");

let currentToken = "";

async function getSession() {
    const { data, error } = await client.auth.getSession();

    if (error || !data.session) {
        window.location.href = "login.html";
        return null;
    }

    currentToken = data.session.access_token;
    return data.session;
}

async function apiRequest(path) {
    const response = await fetch(`${API}${path}`, {
        headers: {
            Authorization: `Bearer ${currentToken}`
        }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || "Unable to load information.");
    }

    return result;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function money(value) {
    return `KES ${Number(value || 0).toLocaleString("en-KE")}`;
}

function dateText(value) {
    if (!value) return "Date not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Date not available"
        : date.toLocaleString();
}

async function loadProfile() {
    const { data, error } = await client
        .from("profiles")
        .select("full_name")
        .single();

    if (!error && data) {
        document.getElementById("customerName").textContent =
            data.full_name || "Fan";
    }
}

async function loadBookings() {
    bookingList.innerHTML = '<p class="muted">Loading bookings...</p>';

    try {
        const result = await apiRequest("/api/bookings/my");
        const bookings = Array.isArray(result) ? result : result.bookings || [];

        document.getElementById("totalBookings").textContent = bookings.length;
        document.getElementById("confirmedBookings").textContent =
            bookings.filter(b => b.booking_status === "confirmed").length;

        if (!bookings.length) {
            bookingList.innerHTML =
                '<p class="muted">You have not made any bookings yet.</p>';
            return;
        }

        bookingList.innerHTML = bookings.map(booking => {
            const event = booking.events || {};
            const ticketType = booking.ticket_types || {};

            return `
        <article class="booking-item">
          <div>
            <h3>${escapeHTML(event.title || "Stadium event")}</h3>
            <p>Venue: ${escapeHTML(event.venue || "To be announced")}</p>
            <p>Category: ${escapeHTML(ticketType.name || "General")}</p>
            <p>Quantity: ${Number(booking.quantity || 0)}</p>
            <p>Amount: ${money(booking.total_amount)}</p>
            <p>Booked: ${dateText(booking.created_at)}</p>
          </div>
          <div>
            <span class="status ${escapeHTML(booking.payment_status)}">
              ${escapeHTML(booking.payment_status || "unknown")}
            </span>
            <p style="margin-top:10px">
              ${escapeHTML(booking.booking_status || "")}
            </p>
          </div>
        </article>
      `;
        }).join("");
    } catch (error) {
        bookingList.innerHTML =
            `<p class="muted">${escapeHTML(error.message)}</p>`;
    }
}

async function loadTickets() {
    ticketList.innerHTML = '<p class="muted">Loading tickets...</p>';

    try {
        const result = await apiRequest("/api/tickets/my");
        const tickets = Array.isArray(result) ? result : result.tickets || [];

        document.getElementById("ticketCount").textContent = tickets.length;

        if (!tickets.length) {
            ticketList.innerHTML =
                '<p class="muted">Your confirmed digital tickets will appear here.</p>';
            return;
        }

        ticketList.innerHTML = tickets.map(ticket => {
            const event = ticket.events || {};
            const qrImage = ticket.qr_data_url || ticket.qrCode || "";

            return `
        <article class="digital-ticket">
          <span class="ticket-label">TALANTA DIGITAL PASS</span>
          <h3>${escapeHTML(event.title || "Event ticket")}</h3>
          <p>Venue: ${escapeHTML(event.venue || "To be announced")}</p>
          <p>Event date: ${dateText(event.event_date)}</p>
          <p>Ticket ID: ${escapeHTML(ticket.id || "")}</p>
          ${qrImage ? `<img src="${escapeHTML(qrImage)}" alt="Ticket QR code">` : ""}
          <p>${ticket.checked_in ? "Already checked in" : "Valid for check-in"}</p>
        </article>
      `;
        }).join("");
    } catch (error) {
        ticketList.innerHTML =
            `<p class="muted">${escapeHTML(error.message)}</p>`;
    }
}

async function refreshDashboard() {
    await Promise.all([loadBookings(), loadTickets()]);
}

document.getElementById("refreshBtn").addEventListener(
    "click", refreshDashboard
);

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "login.html";
});

async function startDashboard() {
    const session = await getSession();
    if (!session) return;

    await loadProfile();
    await refreshDashboard();
}

startDashboard();