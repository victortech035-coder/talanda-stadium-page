const authClient = window.supabase.createClient(
    window.TALANTA_CONFIG.supabaseUrl,
    window.TALANTA_CONFIG.supabaseAnonKey
);

const message = document.getElementById("authMessage");

function showMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("error", isError);
}

function getSafeRedirect() {
    const requested = new URLSearchParams(location.search).get("next");

    // Only allow internal website paths.
    if (
        requested &&
        requested.startsWith("/") &&
        !requested.startsWith("//")
    ) {
        return requested;
    }

    return "/dashboard.html";
}

// REGISTRATION
document.getElementById("registerForm")
    ?.addEventListener("submit", async event => {
        event.preventDefault();

        const form = event.currentTarget;
        const button = form.querySelector("button[type=submit]");

        const fullName = document.getElementById("fullName").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword =
            document.getElementById("confirmPassword").value;

        if (password.length < 8) {
            return showMessage("Password must contain at least 8 characters.", true);
        }

        if (password !== confirmPassword) {
            return showMessage("Passwords do not match.", true);
        }

        button.disabled = true;
        button.textContent = "Creating account...";

        try {
            const { data, error } = await authClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        phone
                    },
                    emailRedirectTo: `${location.origin}/login.html`
                }
            });

            if (error) throw error;

            if (data.session) {
                showMessage("Account created successfully. Redirecting...");
                setTimeout(() => {
                    location.href = "/dashboard.html";
                }, 1000);
            } else {
                showMessage(
                    "Registration received. Check your email to confirm your account before signing in."
                );
            }
        } catch (error) {
            showMessage(error.message || "Registration failed.", true);
        } finally {
            button.disabled = false;
            button.textContent = "Create My Account";
        }
    });

// LOGIN
document.getElementById("loginForm")
    ?.addEventListener("submit", async event => {
        event.preventDefault();

        const form = event.currentTarget;
        const button = form.querySelector("button[type=submit]");

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        button.disabled = true;
        button.textContent = "Signing in...";

        try {
            const { data, error } =
                await authClient.auth.signInWithPassword({
                    email,
                    password
                });

            if (error) throw error;

            showMessage("Login successful. Redirecting...");

            const { data: profile } = await authClient
                .from("profiles")
                .select("role")
                .eq("id", data.user.id)
                .maybeSingle();

            const hasRequestedDestination =
                new URLSearchParams(location.search).has("next");
            const destination = profile?.role === "admin" &&
                !hasRequestedDestination
                ? "/admin.html"
                : getSafeRedirect();

            setTimeout(() => {
                location.href = destination;
            }, 700);

        } catch (error) {
            showMessage(error.message || "Login failed.", true);
        } finally {
            button.disabled = false;
            button.textContent = "Sign In";
        }
    });

// PASSWORD RESET
document.getElementById("resetPassword")
    ?.addEventListener("click", async () => {
        const email = document.getElementById("email").value.trim();

        if (!email) {
            return showMessage("Enter your email address first.", true);
        }

        try {
            const { error } = await authClient.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo: `${location.origin}/reset-password.html`
                }
            );

            if (error) throw error;

            showMessage("If the account exists, a password reset email will be sent.");
        } catch (error) {
            showMessage(error.message, true);
        }
    });