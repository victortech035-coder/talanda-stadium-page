const API = window.TALANTA_CONFIG.apiBaseUrl || "";

const supabaseClient = window.supabaseClient ||
    window.supabase.createClient(
        window.TALANTA_CONFIG.supabaseUrl,
        window.TALANTA_CONFIG.supabaseAnonKey
    );
window.supabaseClient = supabaseClient;

const eventGrid = document.getElementById("eventGrid");

function formatMoney(amount) {
    return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(date) {
    return new Date(date).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

async function loadEvents() {
    if (!eventGrid) return;

    try {
        const response = await fetch(`${API}/api/events`);

        if (!response.ok) throw new Error("Events could not be loaded.");

        const events = await response.json();

        if (!events.length) {
            eventGrid.innerHTML =
                '<div class="empty-state">No upcoming events have been published yet.</div>';
            return;
        }

        eventGrid.innerHTML = events.map(event => {
            const ticketTypes = event.ticket_types || [];
            const cheapest = ticketTypes.length
                ? Math.min(...ticketTypes.map(t => Number(t.price)))
                : null;

            const image = event.image_url ||
                "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=80";

            return `
        <article class="event-card">
          <div class="event-image"
               style="background-image:url('${escapeHTML(image)}')">
            <span class="event-badge">UPCOMING</span>
          </div>
          <div class="event-details">
            <h3>${escapeHTML(event.title)}</h3>
            <div class="event-meta">
              <p><span>DATE</span>${formatDate(event.event_date)}</p>
              <p><span>VENUE</span>${escapeHTML(event.venue)}</p>
            </div>
            <p class="event-price">
              ${cheapest === null
                    ? "Ticket details coming soon"
                    : `From ${formatMoney(cheapest)}`}
            </p>
            <button class="btn btn-primary"
              data-event-id="${escapeHTML(event.id)}">
              <span>Book tickets</span><span aria-hidden="true">↗</span>
            </button>
          </div>
        </article>
      `;
        }).join("");

    } catch (error) {
        eventGrid.innerHTML =
            '<div class="empty-state">Unable to load events. Please try again later.</div>';
        console.error(error);
    }
}

eventGrid?.addEventListener("click", event => {
    const button = event.target.closest("button[data-event-id]");
    if (button) window.openBooking(button.dataset.eventId);
});

async function updateNavigation() {
    const { data: { session } } =
        await supabaseClient.auth.getSession();

    const login = document.getElementById("loginLink");
    const dashboard = document.getElementById("dashboardLink");
    const logout = document.getElementById("logoutButton");

    if (session) {
        login?.classList.add("hidden");
        dashboard?.classList.remove("hidden");
        logout?.classList.remove("hidden");
    } else {
        login?.classList.remove("hidden");
        dashboard?.classList.add("hidden");
        logout?.classList.add("hidden");
    }
}

async function logoutUser() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert(error.message);
        return;
    }

    window.location.href = "/";
}

async function openBooking(eventId) {
    const { data: { session } } =
        await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href =
            `/login.html?next=${encodeURIComponent("/")}`;
        return;
    }

    const response = await fetch(`${API}/api/events`);
    const events = await response.json();
    const event = events.find(item => item.id === eventId);

    if (!event) {
        alert("Event not found.");
        return;
    }

    const choices = (event.ticket_types || [])
        .filter(item => item.available > 0);

    if (!choices.length) {
        alert("Tickets are not currently available.");
        return;
    }

    const selection = choices.map((item, index) =>
        `${index + 1}. ${item.name} — ${formatMoney(item.price)} (${item.available} available)`
    ).join("\n");

    const choice = Number(prompt(
        `${event.title}\n\n${selection}\n\nEnter ticket category number:`
    ));

    const selected = choices[choice - 1];

    if (!selected) return;

    const quantity = Number(prompt("How many tickets? (1–10)"));

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        alert("Please enter a quantity between 1 and 10.");
        return;
    }

    if (quantity > selected.available) {
        alert("Not enough tickets are available.");
        return;
    }

    const paymentMethod = prompt(
        "Select payment method:\n1. M-Pesa\n2. Bank Transfer\n3. Card"
    );

    const methods = { "1": "mpesa", "2": "bank", "3": "card" };

    if (!methods[paymentMethod]) return;

    const paymentReference = prompt(
        "Enter payment reference if already paid, or leave blank if pending:"
    );

    try {
        const bookingResponse = await fetch(`${API}/api/bookings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                eventId,
                ticketTypeId: selected.id,
                quantity,
                paymentMethod: methods[paymentMethod],
                paymentReference: paymentReference || null
            })
        });

        const result = await bookingResponse.json();

        if (!bookingResponse.ok) {
            throw new Error(result.error || "Booking failed.");
        }

        alert(
            `Booking created!\nReference: ${result.bookingId}\n` +
            "Status: Awaiting payment confirmation.\n" +
            "Your QR ticket will be issued after admin approval."
        );

        window.location.href = "/dashboard.html";

    } catch (error) {
        alert(error.message);
    }
}

document.getElementById("logoutButton")
    ?.addEventListener("click", logoutUser);

document.getElementById("menuToggle")
    ?.addEventListener("click", () => {
        const nav = document.getElementById("mainNav");
        const toggle = document.getElementById("menuToggle");
        const isOpen = nav?.classList.toggle("open");

        toggle?.setAttribute("aria-expanded", String(Boolean(isOpen)));
        toggle?.setAttribute(
            "aria-label",
            isOpen ? "Close navigation" : "Open navigation"
        );
    });

document.getElementById("mainNav")
    ?.addEventListener("click", event => {
        if (!event.target.closest("a")) return;

        document.getElementById("mainNav").classList.remove("open");
        document.getElementById("menuToggle")?.setAttribute("aria-expanded", "false");
        document.getElementById("menuToggle")?.setAttribute("aria-label", "Open navigation");
    });

document.getElementById("year").textContent =
    new Date().getFullYear();

supabaseClient.auth.onAuthStateChange(() => {
    updateNavigation();
});

updateNavigation();
loadEvents();