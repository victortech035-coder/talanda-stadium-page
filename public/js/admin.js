const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);
const API = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL ? window.APP_CONFIG.API_BASE_URL : "";

let adminToken = "";
let allBookings = [];

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

async function requireAdmin() {
    const { data, error } = await client.auth.getSession();

    if (error || !data.session) {
        window.location.href = "login.html";
        return false;
    }

    adminToken = data.session.access_token;

    const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

    if (profileError || profile?.role !== "admin") {
        alert("Access denied. Administrator account required.");
        window.location.href = "index.html";
        return false;
    }

    return true;
}

async function adminRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
            ...(options.headers || {})
        }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || "Request failed.");
    }

    return result;
}

function updateStats(bookings) {
    const pending = bookings.filter(
        b => b.payment_status === "pending_payment"
    );

    const confirmed = bookings.filter(
        b => b.payment_status === "paid"
    );

    const revenue = confirmed.reduce(
        (sum, booking) => sum + Number(booking.total_amount || 0),
        0
    );

    document.getElementById("totalBookings").textContent = bookings.length;
    document.getElementById("pendingBookings").textContent = pending.length;
    document.getElementById("confirmedBookings").textContent = confirmed.length;
    document.getElementById("totalRevenue").textContent = money(revenue);
}

function renderBookings() {
    const filter = document.getElementById("bookingFilter").value;

    const bookings = filter === "all"
        ? allBookings
        : allBookings.filter(b => b.payment_status === filter);

    const container = document.getElementById("adminBookingList");

    if (!bookings.length) {
        container.innerHTML = '<p class="muted">No bookings found.</p>';
        return;
    }

    container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>CUSTOMER</th>
          <th>EVENT</th>
          <th>QUANTITY</th>
          <th>AMOUNT</th>
          <th>PAYMENT</th>
          <th>REFERENCE</th>
          <th>ACTION</th>
        </tr>
      </thead>
      <tbody>
        ${bookings.map(booking => {
        const profile = booking.profiles || {};
        const event = booking.events || {};
        const pending = booking.payment_status === "pending_payment";

        return `
            <tr>
              <td>
                ${escapeHTML(profile.full_name || "Customer")}
                <br>${escapeHTML(profile.phone || "")}
              </td>
              <td>${escapeHTML(event.title || "Event")}</td>
              <td>${Number(booking.quantity || 0)}</td>
              <td>${money(booking.total_amount)}</td>
              <td>
                <span class="status ${escapeHTML(booking.payment_status)}">
                  ${escapeHTML(booking.payment_status)}
                </span>
              </td>
              <td>${escapeHTML(booking.payment_reference || "Not supplied")}</td>
              <td>
                ${pending ? `
                  <div class="action-group">
                    <button class="action-btn approve-btn"
                      data-action="approve"
                      data-id="${escapeHTML(booking.id)}">
                      Approve
                    </button>
                    <button class="action-btn reject-btn"
                      data-action="reject"
                      data-id="${escapeHTML(booking.id)}">
                      Reject
                    </button>
                  </div>
                ` : "Reviewed"}
              </td>
            </tr>
          `;
    }).join("")}
      </tbody>
    </table>
  `;
}

async function loadBookings() {
    const container = document.getElementById("adminBookingList");
    container.innerHTML = '<p class="muted">Loading bookings...</p>';

    try {
        const result = await adminRequest("/api/admin/bookings");
        allBookings = Array.isArray(result)
            ? result
            : result.bookings || [];

        updateStats(allBookings);
        renderBookings();
    } catch (error) {
        container.innerHTML = `<p class="muted">${escapeHTML(error.message)}</p>`;
    }
}

async function reviewPayment(id, action) {
    const approved = action === "approve";

    const confirmation = confirm(
        approved
            ? "Have you independently verified this payment? Approve and issue the ticket?"
            : "Are you sure you want to reject this payment?"
    );

    if (!confirmation) return;

    try {
        await adminRequest(`/api/admin/bookings/${encodeURIComponent(id)}/payment`, {
            method: "POST",
            body: JSON.stringify({
                approved
            })
        });

        alert(approved
            ? "Booking approved. Ticket issuance requested."
            : "Booking rejected.");

        await loadBookings();
    } catch (error) {
        alert(error.message);
    }
}

document.getElementById("adminBookingList").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    reviewPayment(button.dataset.id, button.dataset.action);
});

document.getElementById("bookingFilter").addEventListener(
    "change", renderBookings
);

document.getElementById("refreshBtn").addEventListener(
    "click", loadBookings
);

document.getElementById("checkinForm").addEventListener("submit", async event => {
    event.preventDefault();

    const token = document.getElementById("qrToken").value.trim();
    const output = document.getElementById("checkinResult");

    if (!token) return;

    output.textContent = "Verifying ticket...";

    try {
        const result = await adminRequest("/api/admin/tickets/check-in", {
            method: "POST",
            body: JSON.stringify({ qr_token: token })
        });

        output.textContent = result.message || "Ticket check-in completed.";
        document.getElementById("qrToken").value = "";
    } catch (error) {
        output.textContent = error.message;
    }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "login.html";
});

async function startAdmin() {
    const allowed = await requireAdmin();
    if (!allowed) return;

    await loadBookings();
}

startAdmin();