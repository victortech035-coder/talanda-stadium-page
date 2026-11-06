(async function () {
    const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);
    const message = document.getElementById("tickets-message");
    const list = document.getElementById("tickets-list");

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    try {
        const { data, error } = await client.auth.getSession();

        if (error || !data.session) {
            window.location.href = "login.html";
            return;
        }

        const response = await fetch("/api/tickets/my", {
            headers: {
                Authorization: `Bearer ${data.session.access_token}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not retrieve tickets.");
        }

        const tickets = result.tickets || [];

        if (!tickets.length) {
            message.textContent =
                "No approved digital tickets are available yet.";
            return;
        }

        message.textContent =
            `${tickets.length} approved ticket(s) available.`;

        list.replaceChildren();

        tickets.forEach(ticket => {
            const event = ticket.event || {};
            const category = ticket.ticket_type || {};

            const card = document.createElement("article");
            card.className = "digital-ticket";

            const top = document.createElement("div");
            top.className = "digital-ticket-top";

            const title = document.createElement("h2");
            title.textContent = event.title || "TALANTA STADIUM EVENT";

            const venue = document.createElement("p");
            venue.textContent = event.venue || "Venue to be confirmed";

            top.append(title, venue);

            const body = document.createElement("div");
            body.className = "digital-ticket-body";

            const image = document.createElement("img");
            image.src = ticket.qr_data_url;
            image.alt = "Your secure event ticket QR code";

            const details = document.createElement("div");
            details.innerHTML = `
        <div class="ticket-detail">
          <span>Ticket category</span>
          <strong>${escapeHTML(category.name || "Standard")}</strong>
        </div>
        <div class="ticket-detail">
          <span>Event date</span>
          <strong>${escapeHTML(
                event.event_date
                    ? new Date(event.event_date).toLocaleString()
                    : "To be confirmed"
            )}</strong>
        </div>
        <div class="ticket-detail">
          <span>Ticket ID</span>
          <strong>${escapeHTML(ticket.id)}</strong>
        </div>
      `;

            const status = document.createElement("div");
            status.className = `ticket-usage ${ticket.checked_in ? "used" : "valid"
                }`;

            status.textContent = ticket.checked_in
                ? "ALREADY CHECKED IN"
                : "APPROVED — READY FOR ENTRY";

            const print = document.createElement("button");
            print.className = "ticket-print";
            print.type = "button";
            print.textContent = "Print Ticket";
            print.addEventListener("click", () => window.print());

            body.append(image, details, status, print);
            card.append(top, body);
            list.appendChild(card);
        });
    } catch (error) {
        message.textContent = error.message;
    }
})();