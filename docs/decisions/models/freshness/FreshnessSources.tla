------------------------- MODULE FreshnessSources -------------------------
(* Several freshness sources answer the hub's nonce, each with its own key; one may be  *)
(* compromised (Bad) and then answers any version up to the latest as "current". The    *)
(* attacker decides which honest answers reach the hub (drop = never deliver). Rule:    *)
(* any answer above the hub's version makes it fetch; otherwise the hub shows current   *)
(* only when at least K distinct sources answered this nonce.                           *)
EXTENDS Naturals, FiniteSets
CONSTANTS MaxV, MaxT, TH, MaxNonce, Sources, Bad, K

VARIABLES now, aver, pub, hver, last, out, sentAt, ctr, got
vars == <<now, aver, pub, hver, last, out, sentAt, ctr, got>>
Max(a, b) == IF a > b THEN a ELSE b

Init == /\ now = 0 /\ aver = 1 /\ pub = [v \in 1..MaxV |-> 0] /\ hver = 1 /\ last = 0
        /\ out = 0 /\ sentAt = 0 /\ ctr = 0 /\ got = {}

Tick == /\ now < MaxT /\ now' = now + 1 /\ UNCHANGED <<aver, pub, hver, last, out, sentAt, ctr, got>>
Publish == /\ aver < MaxV /\ aver' = aver + 1 /\ pub' = [pub EXCEPT ![aver + 1] = now]
           /\ UNCHANGED <<now, hver, last, out, sentAt, ctr, got>>
Send == /\ out = 0 /\ ctr < MaxNonce /\ ctr' = ctr + 1 /\ out' = ctr + 1 /\ sentAt' = now /\ got' = {}
        /\ UNCHANGED <<now, aver, pub, hver, last>>
Answer(s) == /\ out # 0
             /\ \E v \in 1..aver : /\ (s \notin Bad => v = aver)     \* honest: the latest
                                   /\ got' = got \cup {[src |-> s, v |-> v]}
             /\ UNCHANGED <<now, aver, pub, hver, last, out, sentAt, ctr>>
Decide == /\ out # 0 /\ got # {}
          /\ IF \E r \in got : r.v > hver
               THEN /\ hver' = Max(hver, CHOOSE x \in {r.v : r \in got} : \A y \in {r.v : r \in got} : x >= y)
                    /\ last' = last
               ELSE /\ hver' = hver
                    /\ last' = IF Cardinality({r.src : r \in got}) >= K THEN sentAt ELSE last
          /\ out' = 0 /\ got' = {}
          /\ UNCHANGED <<now, aver, pub, sentAt, ctr>>

Next == Tick \/ Publish \/ Send \/ (\E s \in Sources : Answer(s)) \/ Decide
Spec == Init /\ [][Next]_vars

ShowsCurrent == now <= last + TH
Law == ShowsCurrent => \A v \in (hver + 1)..aver : now <= pub[v] + TH
=============================================================================
