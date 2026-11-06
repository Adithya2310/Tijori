# Demo video script (about 3 minutes)

**Cast**

| Person | Role | Device |
| --- | --- | --- |
| Priya | Vendor | Priya Studio app |
| Asha, Ben, Chen | 3 of the 5 Builders DAO signers | Phones / laptops in one room |
| Dev | Signer who is not in the room | Home |
| Treasurer | Exports the books | Laptop |
| Relayer | Tijori's gas tank | Shown on screen |

## Scenes

| Time | Scene | What to show |
| --- | --- | --- |
| 0:00 | **Problem** | "Treasuries get drained when one key or one remote signer is enough. Tijori: money moves only when a majority is together in one room, each person showing their personal object." |
| 0:15 | **Vault** | Builders DAO in Tijori: 10,000 USDT on Whitechain, 3 of 5 to pay, *Presence guard active*. Click the explorer link: a Safe with the guard installed at creation. It was created gaslessly, with no wallet. |
| 0:35 | **Vendor bills the DAO** | Priya Studio app: fill in "Website redesign, 500 USDT, due Nov 20" and send. Show the ~20-line SDK block in `examples/vendor-studio/server.mjs`. |
| 0:55 | **Inbox and proposal** | In Tijori the invoice appears in the inbox. Asha clicks **Propose payment**. |
| 1:05 | **Together in the room** | Asha taps **Start approval session**. Her device emits the room code (ultrasound; a simulated code in this build). Ben and Chen open Tijori, show their objects, tap **Approve together**. The counter goes 1 → 2 → 3 of 3. |
| 1:40 | **Paid on Whitechain** | Toast: *Paid 500 USDT*. On the explorer: the USDT transfer to Priya, the `CoPresentExecution` event (session, approvers) and the USDT gas refund to the relayer. The signers saw no gas, no wallet and no chain name. |
| 2:00 | **Vendor view** | Priya Studio flips to **Paid** via the signed webhook. Open the public receipt `/invoice/<id>`. |
| 2:15 | **What can't happen** | (1) Dev approves from home: a separate session never adds to the room's quorum. (2) Someone takes valid owner signatures to the Safe app: the guard reverts *PresenceRequired*. (3) A wrong object or wrong room code is rejected and costs no gas. |
| 2:35 | **Business side** | Gas tank card: relayer WBT, payouts sponsored, USDT refunded by vaults, limits. One line on drain protection: simulate first, fee caps and floors, and it only calls our guard and the factory. |
| 2:50 | **Accountant** | **Export CSV**: amount, vendor, reference, the co-present approvers, network fee and tx link. |
| 3:00 | **Close** | "Tijori: payouts nobody can push through alone. Whitechain: on-chain rules, USDT settlement in a second." |
