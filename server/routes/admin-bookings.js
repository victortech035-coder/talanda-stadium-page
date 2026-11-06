const express = require("express");
const router = express.Router();

const { supabaseAdmin } = require("../supabase");
const { requireAuth, requireAdmin } = require("../middleware/auth");

async function getBookingDetails(booking) {
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
        ...booking,
        profiles: profile || null,
        events: event || null,
        ticket_types: ticketType || null
    };
}

router.use(requireAuth, requireAdmin);

router.get("/bookings", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("bookings")
            .select("id, user_id, event_id, ticket_type_id, quantity, total_amount, payment_status, payment_reference, booking_status, created_at")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const bookings = await Promise.all((data || []).map(getBookingDetails));

        res.json({ bookings });
    } catch (error) {
        console.error("Admin bookings lookup failed:", error);
        res.status(500).json({ error: "Could not load bookings." });
    }
});

router.post("/bookings/:id/payment", async (req, res) => {
    try {
        const { approved, note } = req.body || {};
        const decision = approved === true;

        const { data: booking, error: lookupError } = await supabaseAdmin
            .from("bookings")
            .select("id, user_id, event_id, ticket_type_id, payment_status, booking_status")
            .eq("id", req.params.id)
            .maybeSingle();

        if (lookupError) throw lookupError;
        if (!booking) {
            return res.status(404).json({ error: "Booking not found." });
        }

        const { data, error } = await supabaseAdmin
            .from("bookings")
            .update({
                payment_status: decision ? "paid" : "rejected",
                booking_status: decision ? "confirmed" : "cancelled",
                payment_review_note: note || (decision ? "Approved by administrator." : "Rejected by administrator."),
                payment_reviewed_at: new Date().toISOString(),
                reviewed_at: new Date().toISOString()
            })
            .eq("id", req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            message: decision ? "Booking approved." : "Booking rejected.",
            booking: data
        });
    } catch (error) {
        console.error("Booking review failed:", error);
        res.status(500).json({ error: "Could not review booking." });
    }
});

module.exports = router;
