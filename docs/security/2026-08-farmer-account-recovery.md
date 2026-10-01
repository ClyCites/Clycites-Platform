# Farmer account recovery security

## Risk

A cooperative administrator who resets a farmer password could authenticate as that farmer and read
the farmer's records at other cooperatives. Staff-assisted reset is therefore a cross-tenant
privilege-escalation surface even though initiation is organization-scoped.

## Controls

- Only `COOPERATIVE_ADMIN` holds `FARMER_ACCOUNT_RESET`; collection agents are denied.
- The farmer must have an active membership in the initiating administrator's organization.
- Reset codes are random, HMAC-only at rest, single use, and expire after 24 hours.
- Staff receive the reset code but never the farmer's new password.
- Initiation and redemption create separate audit events recording farmer, staff, and organization.
- Redemption revokes every farmer session in the password-update transaction.
- A durable `IN_APP` notification names the initiating staff member, organization, and time. Staff
  cannot dismiss or delete it; it is returned only through the farmer's subject-scoped profile.
- Redis limits initiations per staff user per day. Exceeding the threshold creates a security audit
  event before returning `429`.
- Verified email recovery uses a six-digit code with ten-minute expiry, five attempts, HMAC-only
  storage, single use, and session revocation. Unverified email never creates a reset.
- No SMS provider or phone recovery is implemented.

## Subject-scoped filters

| Route                                   | Service filter                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `GET /me/profile`                       | `Farmer.id = principal.farmerId`, active and not deleted                  |
| `GET /me/deliveries`                    | `Delivery.farmerId = principal.farmerId`                                  |
| `GET /me/deliveries/:deliveryId`        | Delivery id and `farmerId` together                                       |
| `GET /me/settlements`                   | `FarmerSettlement.farmerId = principal.farmerId`                          |
| `GET /me/statements`                    | `FarmerStatement.farmerSettlement.farmerId = principal.farmerId`          |
| `GET /me/farms`                         | `Farm.farmerId = principal.farmerId`                                      |
| `GET /me/qr-identities`                 | `FarmerQrIdentity.farmerId = principal.farmerId`                          |
| `GET /me/consents`                      | `FarmerConsent.farmerId = principal.farmerId`                             |
| `POST /me/consents/:consentId/withdraw` | Consent id and `farmerId` together                                        |
| `POST /me/privacy-requests`             | Server assigns `farmerId` from the principal; the client cannot submit it |

## Open decisions

1. Estate or next-of-kin access after a farmer becomes `DECEASED`.
2. The legal floor below which `DATA_PROCESSING` consent cannot be withdrawn.
3. How `SETTLEMENT_DEDUCTION` withdrawal interacts with outstanding advances.
