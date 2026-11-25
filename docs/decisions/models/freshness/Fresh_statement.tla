---------------------------- MODULE Fresh_statement ----------------------------
(* A hub learns whether its trust state is current. The authority publishes versions;  *)
(* the network may drop, delay and replay anything it ever carried; the attacker may    *)
(* hold the hub's wall clock back (it cannot touch the hub's monotonic clock, `now`).   *)
(* Variant "challenge": the hub sends a nonce; only a reply to its outstanding nonce    *)
(*   counts, and freshness is the monotonic time the nonce was sent.                    *)
(* Variant "receipt": broadcast statements, fresh at the time they are received.        *)
(* Variant "statement": broadcast statements, fresh by their own time vs the wall clock.*)
EXTENDS Naturals
CONSTANTS MaxV, MaxT, TH, MaxNonce, Variant

VARIABLES now, hclock, aver, pub, hver, last, out, sentAt, ctr, net
vars == <<now, hclock, aver, pub, hver, last, out, sentAt, ctr, net>>
Max(a, b) == IF a > b THEN a ELSE b

Init == /\ now = 0 /\ hclock = 0 /\ aver = 1 /\ pub = [v \in 1..MaxV |-> 0]
        /\ hver = 1 /\ last = 0 /\ out = 0 /\ sentAt = 0 /\ ctr = 0
        /\ net = IF Variant = "challenge" THEN {} ELSE {[n |-> 0, v |-> 1, t |-> 0]}

Tick == /\ now < MaxT /\ now' = now + 1
        /\ hclock' \in {hclock, hclock + 1}          \* the attacker may hold the wall clock
        /\ UNCHANGED <<aver, pub, hver, last, out, sentAt, ctr, net>>
Publish == /\ aver < MaxV /\ aver' = aver + 1 /\ pub' = [pub EXCEPT ![aver + 1] = now]
           /\ UNCHANGED <<now, hclock, hver, last, out, sentAt, ctr, net>>

Send == /\ Variant = "challenge" /\ out = 0 /\ ctr < MaxNonce
        /\ ctr' = ctr + 1 /\ out' = ctr + 1 /\ sentAt' = now
        /\ UNCHANGED <<now, hclock, aver, pub, hver, last, net>>
Reply == /\ Variant = "challenge" /\ out # 0
         /\ net' = net \cup {[n |-> out, v |-> aver, t |-> now]}
         /\ UNCHANGED <<now, hclock, aver, pub, hver, last, out, sentAt, ctr>>
Broadcast == /\ Variant # "challenge"
             /\ net' = net \cup {[n |-> 0, v |-> aver, t |-> now]}
             /\ UNCHANGED <<now, hclock, aver, pub, hver, last, out, sentAt, ctr>>
Recv == \E m \in net :
          /\ IF Variant = "challenge"
               THEN /\ out # 0 /\ m.n = out /\ last' = sentAt /\ out' = 0
               ELSE /\ last' = IF Variant = "receipt" THEN now ELSE Max(last, m.t)
                    /\ out' = out
          /\ hver' = Max(hver, m.v)
          /\ UNCHANGED <<now, hclock, aver, pub, sentAt, ctr, net>>

Next == Tick \/ Publish \/ Send \/ Reply \/ Broadcast \/ Recv
Spec == Init /\ [][Next]_vars

ShowsCurrent == IF Variant = "statement" THEN hclock <= last + TH ELSE now <= last + TH
\* The law: showing current means no version the hub lacks was published more than TH ago.
Law == ShowsCurrent => \A v \in (hver + 1)..aver : now <= pub[v] + TH
=============================================================================
