# ADR 037: Device credential sessions

## Status

Accepted

## Context

Shared field handsets need an authentication channel that survives offline work without exposing a
staff browser refresh cookie. Device loss, reassignment, and organization boundaries must remain
immediate server-side controls.

## Decision

Provision each registered device with a public identifier and a 256-bit token shown once. Store only
an HMAC-SHA256 digest of the token. Exchange credentials only in the request body for an access token
and body-delivered refresh token bound to the device, assigned user, and organization.

Browser and device refresh endpoints reject the other channel's tokens. Device revocation revokes
all bound sessions. Device principals are capped to the device organization and are denied on every
subject-scoped route. Credential exchange is denied when the assigned user has enrolled in MFA,
because device sessions have no interactive MFA completion channel.

## Consequences

Lost devices can be revoked immediately, leaked database contents do not reveal usable device
tokens, and shared devices cannot reach personal subject-scoped records. Staff must re-provision a
device when its one-time token is lost.

## Alternatives considered

Reusing browser cookies was rejected because it mixes delivery and revocation channels. Returning
the device token after provisioning was rejected because it would require recoverable storage.
