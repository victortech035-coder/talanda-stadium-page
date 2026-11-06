const express = require("express");
const router = express.Router();

const { supabaseAdmin } = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// GET: Load a customer's own booking and payment information.
router.get("/:id/payment", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: booking, error } = await supabaseAdmin
            .from("bookings")
            .select(`
        id,
        user_id,
        quantity,
        total_amount,
        payment_method,
        payment_status,
        payment_reference,
        payment_review_note,
        events (
          title,
          venue,
          event_date
        )
      `)
            .eq("id", id)
            .eq("user_id", req.user.id)
            .single();

        if (error || !booking) {
            return res.status(404).json({
                error: "Booking not found."
            });
        }

        res.json({
            booking: {
                id: booking.id,
                quantity: booking.quantity,
                total_amount: booking.total_amount,
                payment_method: booking.payment_method,
                payment_status: booking.payment_status,
                payment_reference: booking.payment_reference,
                payment_review_note: booking.payment_review_note,
                event_title: booking.events?.title || "Event",
                venue: booking.events?.venue || "",
                event_date: booking.events?.event_date || null
            }
        });
    } catch (error) {
        console.error("Payment details error:", error);

        res.status(500).json({
            error: "Unable to load payment information."
        });
    }
});

// POST: Submit a payment reference.
router.post("/:id/payment-reference", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const reference = String(req.body.reference || "").trim();

        if (reference.length < 4 || reference.length > 100) {
            return res.status(400).json({
                error: "Reference must contain between 4 and 100 characters."
            });
        }

        // Confirm ownership and current payment status.
        const { data: booking, error: lookupError } = await supabaseAdmin
            .from("bookings")
            .select("id, user_id, payment_status")
            .eq("id", id)
            .eq("user_id", req.user.id)
            .single();

        if (lookupError || !booking) {
            return res.status(404).json({
                error: "Booking not found."
            });
        }

        if (booking.payment_status !== "pending_payment") {
            return res.status(409).json({
                error: "This booking is not accepting a payment reference."
            });
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from("bookings")
            .update({
                payment_reference: reference,
                payment_submitted_at: new Date().toISOString()
            })
            .eq("id", id)
            .eq("user_id", req.user.id)
            .eq("payment_status", "pending_payment")
            .select("id, payment_reference, payment_submitted_at")
            .maybeSingle();

        if (updateError) {
            console.error("Reference update error:", updateError);

            return res.status(500).json({
                error: "Could not save your payment reference."
            });
        }

        if (!updated) {
            return res.status(409).json({
                error: "The booking payment status has changed. Refresh and try again."
            });
        }

        res.json({
            message: "Payment reference submitted for verification.",
            booking: updated
        });
    } catch (error) {
        console.error("Payment submission error:", error);

        res.status(500).json({
            error: "Unable to submit payment reference."
        });
    }
});

module.exports = router;