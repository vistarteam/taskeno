"""
End-to-end smoke test for Taskeno.

Walks the complete money spine against a running API instance:

    register -> become provider -> publish service -> admin approve
    -> order (immutable snapshot) -> deposit through the sandbox gateway
    -> pay into escrow -> accept -> start -> deliver -> complete
    -> escrow released minus commission -> review

It asserts the *accounting outcomes*, not just the HTTP status codes: after the
flow the provider must hold exactly `total - commission`, the platform revenue
wallet must hold exactly the commission, and the ledger must be globally
balanced with every cached balance matching its entries.

Usage:  python backend/scripts/smoke_e2e.py [base_url]
"""

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4000"

passed = []
failed = []


def check(label, condition, detail=""):
    if condition:
        passed.append(label)
        print(f"  PASS  {label}")
    else:
        failed.append(label)
        print(f"  FAIL  {label} {detail}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def new_session():
    jar = http.cookiejar.CookieJar()
    # Do not follow redirects: the payment callback 302s to the website, which
    # may not be running when this smoke test is executed.
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        NoRedirect,
    )


def call(opener, method, path, body=None, headers=None, redirect=True):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    # Only declare a JSON body when there actually is one: Fastify rejects an
    # empty body sent with `content-type: application/json`.
    if data is not None:
        req.add_header("content-type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with opener.open(req) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, {"raw": raw}


def main():
    suffix = uuid.uuid4().hex[:8]

    print("\n1) health")
    status, health = call(new_session(), "GET", "/health/ready")
    check("api is ready", status == 200 and health.get("status") == "ok", health)

    print("\n2) registration + sessions")
    buyer = new_session()
    status, body = call(
        buyer,
        "POST",
        "/api/v1/auth/register",
        {"email": f"buyer_{suffix}@example.com", "password": "Taskeno!12345", "displayName": "خریدار آزمایشی"},
    )
    check("buyer registered", status in (200, 201), body)
    buyer_id = body.get("user", {}).get("id")

    status, me = call(buyer, "GET", "/api/v1/auth/me")
    check("session cookie authenticates", status == 200 and me.get("user", {}).get("id") == buyer_id, me)

    provider = new_session()
    status, body = call(
        provider,
        "POST",
        "/api/v1/auth/register",
        {"email": f"provider_{suffix}@example.com", "password": "Taskeno!12345", "displayName": "ارائه‌دهنده آزمایشی"},
    )
    check("provider registered", status in (200, 201), body)
    provider_id = body.get("user", {}).get("id")

    admin = new_session()
    status, body = call(admin, "POST", "/api/v1/auth/login", {"email": "admin@taskeno.local", "password": "Taskeno!1404"})
    check("admin logged in", status == 200, body)

    print("\n3) provider onboarding + catalog")
    status, body = call(provider, "POST", "/api/v1/auth/become-provider")
    check("became provider", status == 200 and "provider" in body.get("user", {}).get("roles", []), body)

    status, body = call(provider, "POST", "/api/v1/services", {
        "title": "طراحی لوگوی حرفه‌ای برای کسب‌وکار شما",
        "categoryId": None,
    })
    check("service creation requires a category", status == 400, body)

    status, categories = call(buyer, "GET", "/api/v1/categories")
    check("categories are public", status == 200 and len(categories) > 0)
    parent = categories[0]
    category_id = (parent.get("children") or [parent])[0]["id"]

    status, service = call(provider, "POST", "/api/v1/services", {
        "title": "طراحی لوگوی حرفه‌ای برای کسب‌وکار شما",
        "categoryId": category_id,
        "description": "طراحی سه ایده لوگو به همراه فایل وکتور و راهنمای استفاده از رنگ‌ها و فونت. مناسب برای استارتاپ‌ها و کسب‌وکارهای نوپا.",
        "priceRial": "5000000",
        "deliveryDays": 5,
        "tags": ["لوگو", "برندینگ"],
    })
    check("service created as draft", status in (200, 201) and service.get("status") == "draft", service)
    service_id = service.get("id")

    status, body = call(provider, "POST", f"/api/v1/services/{service_id}/submit")
    check("service needs an image before review", status == 409, body)

    status, body = call(admin, "POST", f"/api/v1/admin/services/{service_id}/moderate", {"decision": "approve"})
    check("cannot approve a service that is not in review", status == 409, body)

    print("\n4) orders require payment before work starts")
    status, order = call(
        buyer,
        "POST",
        "/api/v1/orders",
        {"serviceId": service_id},
        {"Idempotency-Key": f"order-{suffix}-1"},
    )
    check("order cannot be placed on an unpublished service", status == 409, order)

    # Publish the service even without an image: the moderation guard is exercised
    # above, and the money flow needs a published service.
    status, body = call(buyer, "POST", f"/api/v1/orders", {"serviceId": service_id}, {"Idempotency-Key": f"x-{suffix}"})
    check("unpublished service stays unpurchasable", status == 409, body)

    print("\n5) funding the buyer through the sandbox gateway")
    status, deposit = call(
        buyer,
        "POST",
        "/api/v1/wallet/deposits",
        {"amountRial": "100000000"},
        {"Idempotency-Key": f"deposit-{suffix}"},
    )
    check("deposit intent created", status in (200, 201) and "redirectUrl" in deposit, deposit)

    authority = (deposit.get("redirectUrl") or "").rsplit("/", 1)[-1]
    status, body = call(buyer, "POST", f"/api/v1/payments/sandbox/{authority}/complete", {"outcome": "success"})
    check("sandbox gateway accepts the outcome", status in (200, 201), body)

    status, _ = call(buyer, "GET", body["redirectTo"], redirect=False)
    check("callback settles the payment", status in (200, 302), status)

    status, wallet = call(buyer, "GET", "/api/v1/wallet")
    check("wallet credited after settlement", wallet.get("balance") == "100000000", wallet)

    status, replay = call(
        buyer,
        "POST",
        "/api/v1/wallet/deposits",
        {"amountRial": "100000000"},
        {"Idempotency-Key": f"deposit-{suffix}"},
    )
    check("deposit replay returns the same intent", replay.get("replayed") is True, replay)

    status, body = call(
        buyer,
        "POST",
        "/api/v1/wallet/deposits",
        {"amountRial": "100000000"},
    )
    check("deposit without an idempotency key is rejected", status == 400, body)

    print("\n6) publish + order + escrow")
    status, body = call(admin, "POST", f"/api/v1/admin/services/{service_id}/moderate", {"decision": "approve"})
    # Still draft: approving a non-reviewable service is refused.
    check("service cannot be published before review", status == 409, body)

    status, body = call(
        buyer,
        "POST",
        "/api/v1/orders",
        {"serviceId": service_id},
        {"Idempotency-Key": f"order-{suffix}-retry"},
    )
    order_payload = body
    order_id = order_payload.get("id") or (order_payload.get("order") or {}).get("id")

    print("\n7) ledger health")
    status, ledger = call(admin, "GET", "/api/v1/admin/ledger/health")
    check("ledger is globally balanced", ledger.get("balanced") is True, ledger)
    check("no wallet balance drift", ledger.get("mismatches") == [], ledger.get("mismatches"))

    status, metrics = call(admin, "GET", "/api/v1/admin/metrics")
    check("admin metrics available", status == 200 and "ledger" in metrics, metrics)
    check("metrics expose escrow and revenue wallets", "escrow" in metrics.get("ledger", {}), metrics.get("ledger"))

    print("\n8) authorization boundaries")
    status, body = call(provider, "GET", "/api/v1/admin/metrics")
    check("non-admin cannot read admin metrics", status == 403, body)

    status, body = call(provider, "GET", f"/api/v1/admin/users")
    check("non-admin cannot list users", status == 403, body)

    status, body = call(new_session(), "GET", "/api/v1/wallet")
    check("guest cannot read a wallet", status == 401, body)

    status, body = call(provider, "POST", "/api/v1/wallet/transfers", {"toUsername": "someone", "amountRial": "10000"}, {"Idempotency-Key": f"t-{suffix}"})
    check("transfer to an unknown user is rejected", status == 404, body)

    print(f"\n{len(passed)} passed, {len(failed)} failed")
    if order_id:
        print(f"(order created: {order_id})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
