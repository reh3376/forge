"""Python 3.14 compatibility patch for asyncua.

PEP 649 (deferred evaluation of annotations) in Python 3.14 causes
``typing.get_type_hints()`` to resolve annotations in the class
namespace, picking up property descriptors and Field objects instead
of the intended types.

asyncua >= 1.2b2 includes its own fix (``get_safe_type_hints``).
This module is retained as a no-op shim so existing import sites
continue to work.
"""

from __future__ import annotations

_PATCHED = False


def patch_asyncua_binary() -> None:
    """Apply Python 3.14 compatibility patch for asyncua.

    With asyncua >= 1.2b2, the library ships its own fix.
    This function is now a no-op retained for API compatibility.
    """
    global _PATCHED
    _PATCHED = True
