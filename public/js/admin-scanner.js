(async function () {
    const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);

    const startButton = document.getElementById("start-scanner");
    const stopButton = document.getElementById("stop-scanner");
    const message = document.getElementById("scanner-message");
    const manualForm = document.getElementById("manual-form");

    const resultBox = document.getElementById("verification-result");
    const resultHeading = document.getElementById("result-heading");
    const resultMessage = document.getElementById("result-message");
    const resultEvent = document.getElementById("result-event");
    const resultTime = document.getElementById("result-time");

    let scanner = null;
    let processing = false;
    let lastToken = "";
    let lastScanAt = 0;

    const UUID_REGEX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    async function sessionToken() {
        const { data, error } = await client.auth.getSession();

        if (error || !data.session) {
            window.location.href = "login.html";
            throw new Error("Please log in.");
        }

        return data.session.access_token;
    }

    function extractToken(raw) {
        try {
            const parsed = JSON.parse(raw);

            if (
                parsed.type === "TALANTA_STADIUM_TICKET" &&
                parsed.version === 1
            ) {
                return parsed.token;
            }
        } catch {
            // Also accept a plain UUID from a compatible QR reader.
        }

        return raw.trim();
    }

    async function verifyTicket(raw) {
        const token = extractToken(raw);

        if (!UUID_REGEX.test(token)) {
            showResult({
                valid: false,
                status: "invalid",
                message: "Invalid ticket QR code."
            });
            return;
        }

        if (processing) return;

        processing = true;
        message.textContent = "Checking ticket...";

        try {
            const accessToken = await sessionToken();

            const response = await fetch(
                "/api/admin/tickets/check-in",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({ qr_token: token })
                }
            );

            const result = await response.json();

            if (response.status === 401 || response.status === 403) {
                throw new Error("Administrator access is required.");
            }

            showResult(result);

            if (!response.ok && response.status !== 409) {
                message.textContent = result.error || "Verification failed.";
            } else {
                message.textContent = "Verification completed.";
            }
        } catch (error) {
            showResult({
                valid: false,
                status: "error",
                message: error.message
            });
            message.textContent = "Could not complete verification.";
        } finally {
            processing = false;
        }
    }

    function showResult(result) {
        const accepted = result.valid === true;

        resultBox.hidden = false;
        resultBox.className = accepted
            ? "verification-result accepted"
            : "verification-result rejected";

        resultHeading.textContent = accepted
            ? "TICKET ACCEPTED"
            : "TICKET NOT ACCEPTED";

        resultMessage.textContent =
            result.message || "Ticket verification completed.";

        resultEvent.textContent = result.event_title
            ? `Event: ${result.event_title}`
            : "";

        resultTime.textContent = result.checked_in_at
            ? `Checked in: ${new Date(result.checked_in_at).toLocaleString()}`
            : "";
    }

    startButton.addEventListener("click", async () => {
        if (scanner) return;

        try {
            scanner = new Html5Qrcode("qr-reader");

            await scanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                async decodedText => {
                    const now = Date.now();

                    if (
                        decodedText === lastToken &&
                        now - lastScanAt < 3000
                    ) {
                        return;
                    }

                    lastToken = decodedText;
                    lastScanAt = now;

                    await verifyTicket(decodedText);
                },
                () => { }
            );

            startButton.hidden = true;
            stopButton.hidden = false;
            message.textContent = "Camera active. Point it at a ticket QR code.";
        } catch (error) {
            scanner = null;
            message.textContent =
                "Camera could not start. Check browser permissions and use HTTPS.";
        }
    });

    stopButton.addEventListener("click", async () => {
        if (!scanner) return;

        try {
            if (scanner.isScanning) {
                await scanner.stop();
            }

            await scanner.clear();
        } catch (error) {
            console.error("Scanner stop error:", error);
        }

        scanner = null;
        startButton.hidden = false;
        stopButton.hidden = true;
        message.textContent = "Scanner stopped.";
    });

    manualForm.addEventListener("submit", async event => {
        event.preventDefault();

        const value = document.getElementById("manual-token").value.trim();

        await verifyTicket(value);
    });

    try {
        await sessionToken();
    } catch {
        return;
    }
})();