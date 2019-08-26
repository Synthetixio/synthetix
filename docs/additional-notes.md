# Additional Notes

## A Note on Conversion Fee Evasion

The Synthetix system has both a conversion and a transfer fee. Although they should be distinct,
the preferred currency auto conversion on transfer only charges the transfer fee, and not the conversion fee.
As a result, it is possible to convert Synths more cheaply whenever the transfer fee is less than the conversion fee.
Given that the transfer fee is currently 0, it is possible by this means to perform free conversions. First, this potentially
eliminates all fee revenue for the system to incentivise participants with. Second, if markets have priced in the conversion fee
and are unaware of the exploit, then there is a profit cycle here.

In particular:

$$
\text{let } \ \phi_\kappa, \ \phi_\tau \in [0,1] \ \text{ be the conversion and transfer fee rates, respectively.} \\
\pi_A, \ \pi_B \ \text{ be the prices of synths } A \text{ and } B \text{ in terms of some implicit common currency.} \\
Q_A \text{ be a starting quantity of synth A.} \\
$$

Then to convert from $A$ to $B$, quantities

$$
Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\kappa) \\
Q^\tau_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\tau)
$$

are received if the user performs a standard conversion or a transfer conversion, respectively.
The profit of performing a transfer conversion relative to a standard one is then:

$$
Q^\tau_B - Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(\phi_\kappa - \phi_\tau)
$$

That is, the percentage profit is simply $(\phi_\kappa - \phi_\tau)$. With no transfer fee, the profit is $\phi_\kappa$, as expected.
