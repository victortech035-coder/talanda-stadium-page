const express = require("express");
const QRCode = require("qrcode");
const router = express.Router();

const { supabaseAdmin } = require("../supabase");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET /api/tickets/my
router.get("/tickets/my", requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("tickets")
            .select(`
        id,
        qr_token,
        checked_in,
        checked_in_at,
        bookings!inner (
          id,
          user_id,
          payment_status,
          booking_status,
          quantity,
          total_amount,
          events (
            title,
            venue,
            event_date
          ),
          ticket_types (
            name,
            price
          )
        )
      `)
            .eq("user_id", req.user.id)
            .eq("bookings.payment_status", "paid")
            .eq("bookings.booking_status", "confirmed")
            .order("id", { ascending: false });

        if (error) throw error;

        const tickets = await Promise.all(
            (data || []).map(async ticket => {
                const qrPayload = JSON.stringify({
                    type: "TALANTA_STADIUM_TICKET",
                    version: 1,
                    token: ticket.qr_token
                });

                const qr_data_url = await QRCode.toDataURL(qrPayload, {
                    errorCorrectionLevel: "H",
                    margin: 2,
                    width: 320
                });

                return {
                    id: ticket.id,
                    booking_id: ticket.bookings.id,
                    qr_data_url,
                    checked_in: ticket.checked_in,
                    checked_in_at: ticket.checked_in_at,
                    event: ticket.bookings.events,
                    ticket_type: ticket.bookings.ticket_types,
                    payment_status: ticket.bookings.payment_status
                };
            })
        );

        res.json({ tickets });
    } catch (error) {
        console.error("Customer tickets error:", error);
        res.status(500).json({
            error: "Unable to load your tickets."
        });
    }
});

// POST /api/admin/tickets/check-in
router.post(
    "/admin/tickets/check-in",
    requireAuth,
    requireAdmin,
    async (req, res) => {
        try {
            const qrToken = String(req.body.qr_token || "").trim();

            if (!UUID_REGEX.test(qrToken)) {
                return res.status(400).json({
                    valid: false,
                    status: "invalid",
                    error: "Invalid QR ticket token."
                });
            }

            const { data, error } = await supabaseAdmin.rpc(
                "verify_and_checkin_ticket",
                {
                    p_qr_token: qrToken,
                    p_admin_id: req.user.id
                }
            );

            if (error) {
                console.error("Ticket verification RPC error:", error);

                return res.status(500).json({
                    valid: false,
                    error: "Ticket verification failed."
                });
            }

            const httpStatus = data?.valid ? 200 : 409;

            res.status(httpStatus).json(data);
        } catch (error) {
            console.error("Ticket check-in error:", error);

            res.status(500).json({
                valid: false,
                error: "Unable to verify ticket."
            });
        }
    }
);

module.exports = router;