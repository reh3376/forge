"""The trust root's certificates: one offline answer to "is this certificate real?" (D-23).

A certificate is real when it was issued under the deployment's trust anchor, to the hub or
module it names, within the written profile. This package is the foundation every later
step of the security framework trusts (D-21 §11 step 1a, FB-293):

* :mod:`.ids`      the SPIFFE id of a deployment, a hub or a module, parsed strictly;
* :mod:`.stages`   development, test and production, and what a release refuses;
* :mod:`.profile`  the roles of certificate, read from the governed list ``certificate-roles``;
* :mod:`.anchor`   the anchor's form, and the rule that only the pinned genesis counts (for now);
* :mod:`.issuer`   issues a certificate, refusing any request outside the profile;
* :mod:`.signer`   a key held on a device, reached through PKCS#11, as ``cryptography`` signs;
* :mod:`.verify`   the verifier; ``forge-core/src/go/trust`` is its Go twin, held to the same
  vectors.

Nothing here touches the link yet: the hub keeps its present checks until step 2.
"""
