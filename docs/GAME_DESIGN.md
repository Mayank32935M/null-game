# NULL GAME — Game Design Document (GDD v2)

## 1. Product Vision
NULL is a psychological intelligence thriller. The player discovers The Ledger—an ancient supernatural artefact that grants the power to eliminate anyone whose legal name is inscribed within it. The objective is to drive global crime below $25\%$ without being attributed or consumed by supernatural costs.

Unlike simplistic power fantasies, every death ripples through a living, stateful world. Eliminating a syndicate boss does not automatically eradicate crime; it triggers factional succession struggles, street violence surges, and escalating federal investigations.

---

## 2. Core Game Loop
The game operates in an eight-stage loop:

$$\text{OBSERVE} \longrightarrow \text{INVESTIGATE} \longrightarrow \text{HYPOTHESIZE} \longrightarrow \text{DECIDE} \longrightarrow \text{RESOLVE} \longrightarrow \text{ADVANCE} \longrightarrow \text{REPORT} \longrightarrow \text{REASSESS}$$

1. **Observe:** Check the Dashboard for societal indicators (Crime Index, Attribution Risk, Public Fear, Public Trust) and agency alerts.
2. **Investigate:** Review Dossiers or perform nonlethal investigation actions to uncover targets' legal identities and network connections.
3. **Hypothesize:** Identify the structural linchpin whose removal would dismantle criminal infrastructure without causing unacceptable collateral chaos.
4. **Decide:** Select an action:
   - Inscribe in The Ledger (Supernatural elimination).
   - Advance Turn / Wait (Observe natural drift).
   - Nonlethal intervention (Anonymous leak / support investigation).
5. **Resolve:** `actionEngine` validates the rules and updates simulation state deterministically.
6. **Advance:** Time ticks forward. Agencies correlate death patterns, factions react, and crime categories adjust.
7. **Report:** The narrative layer presents the news reactions, public statements, and the Watcher's dry observations.
8. **Reassess:** Evaluate the new state of the world and plan the next move.

---

## 3. The Supernatural Artefact: The Ledger

### Core Rules
- **True Legal Name:** The target's exact legal identity must be inscribed. Pseudonyms and aliases fail.
- **Mental Image:** The bearer must have visualized the target's face.
- **Valid Cause:** One of four valid mechanisms must be specified:
  - `cardiac` (Cardiac Arrest): Low risk ($0.6\times$ suspicion, $0.3\times$ fear). Clean and untraceable.
  - `accident` (Staged Accident): Medium risk ($1.0\times$ suspicion, $0.6\times$ fear). Plausible if not overused.
  - `publicCollapse` (Public Collapse): High risk ($1.8\times$ suspicion, $1.5\times$ fear). Striking public spectacle.
  - `orchestrated` (Third-party orchestration): Medium risk ($0.8\times$ suspicion, $0.8\times$ fear). Leaves forensic threads.
- **Lifespan Cost:** Every entry permanently burns $3\text{--}14$ days of the bearer's natural lifespan.

### The Sight Bargain
- **Cost:** Exactly $50\%$ of the bearer's remaining natural lifespan.
- **Grants:** Supernatural perception to view true legal names and remaining lifespans above anyone observed.
- **Irreversible:** Permanent trade-off between investigative safety and mortal longevity.

---

## 4. Crime Index & Victory Conditions

### Category Weights
- Violent Crime: $30\%$
- Organised Crime: $25\%$
- Corruption: $20\%$
- Exploitation & Financial Crime: $15\%$
- Institutional Capacity: $10\%$ *(Inverted: higher capacity reduces total crime)*

### Victory Condition
- Global Crime Index $< 25.0\%$ maintained for **$3$ consecutive turns**.

### Defeat Conditions
- **Consumed:** Lifespan reaches $0$ days.
- **Exposed:** Attribution Risk reaches $\ge 95\%$.
- **Stalemate:** Turn limit reached without achieving victory.

### Endings
- **The Quiet Reformer:** Low fear ($<30$), high trust ($>50$), low exposure ($<40$).
- **Fearful Order:** Crime low, but public fear high ($>60$).
- **Unstable Victory:** Low crime, but institutional stability shattered ($<30$).
- **Consumed / Exposed:** Bearer dies or is apprehended.
