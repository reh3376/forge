# Authentication

WHK MES uses JSON Web Tokens (JWT) to secure its GraphQL API. Users authenticate with a username and password and receive an access token.

## Login Flow

1. The client sends credentials to the `/login` endpoint.
2. `AuthService` validates the user and issues a JWT via `TokenService`.
3. The token is returned in the response and should be stored by the client.
4. Subsequent requests include `Authorization: Bearer <token>` in the headers.

```typescript
// simplified login sequence
const user = await authService.validateUser(username, password);
if (!user) throw new UnauthorizedException();
return tokenService.createToken({ id: user.id, username });
```

## Token Contents

Tokens include the user ID and roles. Role-based guards enforce access to GraphQL resolvers and REST routes.

## Refreshing Tokens

Tokens expire after a configurable period (default 1 hour). Clients should reauthenticate when the server responds with `401 Unauthorized`.

## Managing Users

User accounts are stored in the database. Admins can create or deactivate users through the GraphQL API or the admin UI.
