# Telemetrics pan/tilt serial protocol: PT-HP-S4, with S2 for comparison

## Sources and page references

| Short name | Document                                                                                                                                                                | URL                                                                                                         | Page numbering                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **UM-S4**  | Telemetrics "HP Servo Pan/Tilt Head Model PT-HP-S4 User's Manual", rev 05/15                                                                                            | https://www.manualslib.com/manual/3662942/Telemetrics-Pt-Hp-S4.html                                         | ManualsLib viewer page `?page=NN`. The printed page number is the viewer page minus 8 (viewer 35 = printed 27). |
| **OM-S4**  | Telemetrics PT-HP-S4 Operation Manual. Appendix A is titled "Telemetrics Serial Data Protocol", has a "S2 Serial Protocol Users Manual" copyright notice and is © 2003. | https://www.manualslib.com/manual/577575/Telemetrics-Pt-Hp-S4.html                                          | Viewer page. The printed page number is the viewer page minus 3 (viewer 19 = printed 16).                       |
| **S2**     | "Operation & Installation Manual Servo Pan/Tilt Heads, Models PT-CP-S2 / PT-HP-S2 / PT-LP-S2", Appendix A                                                               | https://silo.tips/download/operation-installation-manual-servo-pan-tilt-heads-models-pt-cp-s2-pt-hp-s2-pt-l | Printed page numbers 25–34.                                                                                     |

Not used: the CP-RMR-S manual (885296), which was optional. Both S4 manuals already gave a complete command set.

How the text was extracted: I read the ManualsLib pages in the browser and rebuilt their text layer row by row from screen coordinates. The table rows below therefore come straight from that text layer. Superscript exponents such as `(± 2^31)` were split off in the text layer, and I put them back together.

**Main finding:** all three manuals describe the same ASCII protocol. UM-S4 (rev 05/15) is a superset of the S2 and OM-S4 appendices. It differs in four ways:

- 256 presets instead of 64.
- It adds the request command `O`, the commands `G/g W/w U/u V/v K/k`, `CV`, `@CNTR` and the `@WPCT 0–6` table.
- It renames `a` to `A`.
- It changes what `@ZERO` does (see section 10).

---

## 1. Physical layer and serial settings

Sources: UM-S4 p.35 (printed 27), p.32 (printed 24); S2 p.25; OM-S4 p.19.

- Verbatim: "The communication rate is 9600 BAUD. Protocol is 8 data bits, one stop bit, and no parity."
- Lens calibration via PC (UM-S4 p.32): "set the serial port of the personal computer to 9600, no parity, 8 data bits, 1 stop bit, and no flow control."
- Interface: 9-pin D connector, set to RS-232 or RS-422.
  - RS-232 allows up to 100 ft. RS-422 allows up to 4000 ft. UM-S4 p.21 misprints RS-422 as "RS-242".
  - UM-S4 p.23: "DIP switch S2 sets the Serial Data Board for use with S-232 or RS-422". S2 pins 1+2 OFF = RS-232, ON = RS-422.
  - OM-S4 p.17 and p.30 (older 53915 board): DIP S1 pin 8 is "RS232/RS422", with OFF = RS422 and ON = RS232. Appendix B, OM-S4 p.31: on board revision P or higher, use S2 pins 1/2 and do not use S1-8.

Pinout of the 9-pin D (UM-S4 p.47, identical in S2 p.24):

| Pin | RS-232             | RS-422               |
| --- | ------------------ | -------------------- |
| 1   | No Connection      | TX Data + (From P/T) |
| 2   | TX Data (From P/T) | TX Data - (From P/T) |
| 3   | RX Data (to P/T)   | RX Data - (to P/T)   |
| 4   | No Connection      | RX Data + (to P/T)   |
| 5   | Ground             | Ground               |
| 6–9 | No Connection      | No Connection        |

- **Ethernet (S4 only).** UM-S4 p.23: "Communication with a control panel can also be accomplished using an RJ45 Ethernet connector … 100BASET/10BASET".
  - The IP address is set with the "DS1 Configuration utility" (UM-S4 p.24). The Pan/Tilt Configuration Software connects using an "IP Address and Port" (UM-S4 p.26, p.32).
  - **None of the manuals gives a TCP port number or says whether the ASCII protocol runs unchanged over TCP.** _Inferred:_ "DS1" suggests a Tibbo DS-series serial-to-Ethernet module, which would give a transparent TCP tunnel carrying the same ASCII protocol. This is unverified.
  - RJ-45 pins (UM-S4 p.49): 1 TX+, 2 TX-, 3 RX+, 4 EPWR+, 5 EPWR+, 6 RX-, 7 EPWR-, 8 EPWR-.

## 2. Framing

Source: UM-S4 p.35 and p.36 (printed 27–28). S2 p.25 and OM-S4 p.19 are word-for-word the same, except that S2 says "head" where S4 says "controller".

Verbatim (UM-S4 p.35):

> Control is accomplished by sending commands consisting of ASCII characters terminated by an ASCII carriage return (<CR>, hex 0D). In most cases, several commands may be sent together on the same line before sending the <CR>. However, in the case of the recall preset command, other commands may precede it but any control commands following it on the same line are ignored. Feedback commands will still continue to respond. A control command line will not be executed until the <CR> is received. ASCII backspace (<BS>, hex 08) can be used to correct errors in the command line. After the command line has been executed, a <CR> will be sent back to the host to acknowledge completion.
>
> Each command consists of letters and may be followed by numerical parameters needed for the command. The commands are CASE SENSITIVE. Numerical parameters are specified by the string of ASCII digits representing the decimal value. For example, a value of 26 is sent as a '2' followed by a '6', (i.e., hex 32, hex 36). Where a command has more than one parameter, the parameters should be separated by a space. No other spaces are necessary, though they may be used if desired.
>
> In cases where the host does not monitor responding carriage returns from the controller, the host will not know whether a command line has been completed.
>
> The controller can receive new commands while it is processing previous commands except when the controller is processing a preset position recall. During a preset recall, all incoming characters are ignored except for an ASCII cancel character (<CAN>, control-X, hex 18) which tells the controller to abort the recall. Therefore, the host should send a <CAN> preceding all command lines. This way, if a recall was in progress, it will be aborted and the controller will accept the command.
> If no recall was in progress, the <CAN> will be ignored.

UM-S4 p.36 adds: "examples are shown enclosed in single quotes, only the characters within the quotes are to be sent … examples may use unnecessary spaces for clarity, which need not be used".

Summary:

| Item                           | Value                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminator (host to head)      | `<CR>` 0x0D. Nothing in the manuals mentions LF.                                                                                                                                                                                                                                                                                                           |
| Acknowledgement (head to host) | `<CR>` after the line has been executed. After `C`, it comes when the recall is complete.                                                                                                                                                                                                                                                                  |
| Abort / line prefix            | `<CAN>` 0x18. The manual recommends sending it in front of every line.                                                                                                                                                                                                                                                                                     |
| Line editing                   | `<BS>` 0x08                                                                                                                                                                                                                                                                                                                                                |
| Case                           | Commands are case-sensitive. Uppercase usually sets a value; lowercase reads it, as with `P` vs `p`.                                                                                                                                                                                                                                                       |
| Parameters                     | Decimal ASCII. Separate multiple parameters with a space. Other spaces are optional.                                                                                                                                                                                                                                                                       |
| Several commands per line      | Allowed. After a `C` (recall), any control commands that follow on the same line are ignored, but feedback commands still answer.                                                                                                                                                                                                                          |
| Address / unit prefix          | **None.** Each head has its own serial line. UM-S4 p.38: "The information stored in a preset location does not include the camera to which the preset corresponds … it is therefore up to the host application to select the proper camera". Camera selection is done outside the protocol, for example with a TM-STS Serial Transfer Switch (UM-S4 p.32). |
| Responses to queries           | _Inferred from the examples:_ the values come back separated by spaces and in the order requested, followed by `<CR>`. Example: `p t z f` returns `111 222 333 444<CR>`.                                                                                                                                                                                   |

## 3. Manual motion (velocity), R = stop

Sources: UM-S4 p.37 (printed 29), p.40 (printed 32); S2 p.26, p.29; OM-S4 p.20, p.23.

UM-S4 p.37 says the procedure is: "1. Reset motion voltages with the 'R' command. 2. Move the camera using 'P', 'T' 'Z' and 'F' commands." Each command takes one parameter from 0 to 32767, with 16383 meaning no motion. The further the value is from 16383, the faster the motion.

Direction table (UM-S4 p.37, identical in S2 and OM-S4):

| Command               | < Less than 16383 | > Greater than 16383 |
| --------------------- | ----------------- | -------------------- |
| 'P' Pan               | Right             | Left                 |
| 'T' Tilt              | Down              | Up                   |
| 'Z' Zoom              | In (Tele)         | Out (Wide)           |
| 'F' Focus             | Near              | Far                  |
| 'X' Televator/Trolley | Down/Right        | Up/Left              |
| 'Y' Dolley            | Right             | Left                 |
| "I" Iris              | Close             | Open                 |

UM-S4 p.37: "the 'R' command, which has no parameters, will reset all control voltages to the no motion value."

**Velocity Commands** (UM-S4 p.40, the same in S2 p.29 and OM-S4 p.23):

| Command | Parameters       | Description                                                       |
| ------- | ---------------- | ----------------------------------------------------------------- |
| P       | 0 – 32767 (2^15) | Set Pan Velocity ( 0 = R ; 16383 = STOP ; 32767 = L)              |
| T       | 0 – 32767 (2^15) | Set Tilt Velocity ( 0 = D ; 16383 = STOP ; 32767 = U)             |
| Z       | 0 – 32767 (2^15) | Set Zoom Velocity ( 0 = T ; 16383 = STOP ; 32767 = W)             |
| F       | 0 – 32767 (2^15) | Set Focus Velocity ( 0 = N ; 16383 = STOP ; 32767 = F)            |
| X       | 0 – 32767 (2^15) | Set (Aux) Trk/Ped Velocity ( 0 = R,D; 16383 = STOP ; 32767 = L,U) |
| Y       | 0 – 32767 (2^15) | Set Aux Velocity ( 0 = R ; 16383 = STOP ; 32767 = L)              |
| I       | 0 – 32767 (2^15) | Set Iris Velocity ( 0 = C ; 16383 = STOP ; 32767 = O)             |
| R       | <NONE>           | Stop All Motion                                                   |

The manuals do not say whether a velocity, once set, keeps running until `R` or a new value arrives, or whether it times out. _Inferred:_ it keeps running, because `R` exists and the joystick model sends updates continuously. Only `CV` is documented with a 2-second timeout.

## 4. Position / status queries (Request Commands)

Source: UM-S4 p.40 (printed 32). S2 p.29 and OM-S4 p.23 have the same rows except `O`, and they spell the iris-mode query `IM`.

| Command               | Return parameters                                                                                                                            | Description                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| p                     | ± 2147483647 (± 2^31)                                                                                                                        | Current Pan Position                                                           |
| t                     | ± 2147483647 (± 2^31)                                                                                                                        | Current Tilt Position                                                          |
| z                     | 0 – 1024 (2^10)                                                                                                                              | Current Zoom Position                                                          |
| f                     | 0 – 1024 (2^10)                                                                                                                              | Current Focus Position                                                         |
| x                     | ± 2147483647 (± 2^31)                                                                                                                        | Current Trolley/Pedestal Position                                              |
| y                     | ± 2147483647 (± 2^31)                                                                                                                        | Current Aux Position                                                           |
| i                     | 0 – 255 (2^10) [sic]                                                                                                                         | Current Iris Position                                                          |
| m                     | 0 – 255 (2^10) [sic]                                                                                                                         | Current Master Pedestal Position                                               |
| s                     | "MASTER = XX LENS = YY"                                                                                                                      | Returns the number of times the Microprocessors have COP reset                 |
| O                     | B[x] x = 0,1 (TALLY) / G[x] x = 0,1 (EXT) / V[x] x = 0,1 (CAM PWR) / W[x] x = 0,1 (WIPER) / U[x] x = 0,1 (WASHER) / K[x] x = 0,1 (CONT.CLOS) | Returns Command Character of WP function and 0 for off, 1 for On (**S4 only**) |
| im (S4) / IM (S2, OM) | "IA" = AUTO "ILP" = LOCAL                                                                                                                    | Return Iris Mode                                                               |

Notes:

- The S4 user manual writes `im` in lowercase and the S2 and OM manuals write `IM`. Because the protocol is case-sensitive, test both forms.
- The printed range for zoom and focus is "0 – 1024 (2^10)". This is presumably a 10-bit pot reading, 0–1023 (inferred).
- Example (UM-S4 p.39): host sends `'p t z f <CR>'`, controller responds `'111 222 333 444 <CR>'`.

## 5. PWM (direct drive) commands

Source: UM-S4 p.41 (printed 33); S2 p.30; OM-S4 p.24. They share letters with the queries. **Inferred:** with a parameter the letter sets PWM drive; without a parameter it queries the position.

| Command | Parameters    | Description                                           |
| ------- | ------------- | ----------------------------------------------------- |
| p       | ± 255 (± 2^8) | Set Pan PWM Drive (-255 = R ; 0 = STOP ; 255 = L)     |
| t       | ± 255 (± 2^8) | Set Tilt PWM Drive (-255 = D ; 0 = STOP ; 255 = U)    |
| z       | ± 255 (± 2^8) | Set Zoom PWM Drive (-255 = T ; 0 = STOP ; 255 = W)    |
| f       | ± 255 (± 2^8) | Set Focus PWM Drive (-255 = N ; 0 = STOP ; 255 = F)   |
| x       | ± 255 (± 2^8) | Set Trk/Ped PWM Drive (-255 = R ; 0 = STOP ; 255 = L) |
| y       | ± 255 (± 2^8) | Set Aux PWM Drive (-255 = R ; 0 = STOP ; 255 = L)     |

## 6. Miscellaneous commands (tally, iris mode, increments, peripherals)

Source: UM-S4 p.41 (printed 33). S2 p.30 and OM-S4 p.24 have only B, b, a, IA, IL, II, BI and FI. OM-S4 p.27 also lists W/w/U/u/V/v under the @WPCT section.

| Command             | Parameters | Description                                                           |
| ------------------- | ---------- | --------------------------------------------------------------------- |
| B                   | <NONE>     | Turn Tally On                                                         |
| b                   | <NONE>     | Turn Tally Off                                                        |
| G                   | (none)     | Turn Extender On                                                      |
| g                   | (none)     | Turn Extender Off                                                     |
| W                   | (none)     | Turn Wiper On                                                         |
| w                   | (none)     | Turn Wiper Off                                                        |
| U                   | (none)     | Turn Washer On                                                        |
| u                   | (none)     | Turn Washer Off                                                       |
| V                   | (none)     | Turn Cam Power On (Stabilizer)                                        |
| v                   | (none)     | Turn Cam Power Off (Stabilizer)                                       |
| K                   | (none)     | Turn Contact Closure On                                               |
| k                   | (none)     | Turn Contact Closure Off (Only Works for On-Board TM Contact Closure) |
| A (S4) / a (S2, OM) | <NONE>     | Resets the number of times the Microprocessors have COP reset         |
| IA                  | <NONE>     | Sets Iris to Auto Mode (Camera takes control)                         |
| IL                  | <NONE>     | Sets Iris to Local Mode (P/T takes control)                           |
| II                  | ± 255      | Increments Current Iris Position (+ = Close , - = Open)               |
| BI                  | ± 255      | Increments Current Master Pedestal (Black) Position                   |
| FI                  | ± 255      | Increments Current Focus Position                                     |

Which physical output G, W, U, V and K drive depends on `@WPCT` (see section 10).

There is **no zoom-increment command**: II, BI and FI exist, but no "ZI". Absolute zoom only works through `CX` or `CV`.

## 7. Presets / shots

### 7.1 Count

- UM-S4 p.38: "There are 256 preset positions (numbered 0 to 255) that are available in the non-volatile memory of the controller."
- S2 p.26 and OM-S4 p.21: "64 preset positions, numbered 0 to 63".

### 7.2 Preset Commands table

Source: UM-S4 p.42 (printed 34).

| Command         | Parameters | Description                                                 |
| --------------- | ---------- | ----------------------------------------------------------- |
| C               | 0 – 255    | Call Preset Shot                                            |
| E               | 0 – 255    | Enter Preset Shot                                           |
| e               | 0 – 255    | Show Position Parameters for Shot                           |
| 0x18            | <NONE>     | Cancel Current Shot (press CTRL+X or send a hexadecimal 18) |
| CX*             | SPECIAL    | Call Preset Shot using supplied parameters                  |
| EX              | SPECIAL    | Store Preset Shot using supplied parameters                 |
| (Not Available) |            |                                                             |
| CV**            | SPECIAL    | Progressive Positional Motion (Special Option)              |

The text layer shows "(Not Available)" on its own line between EX and CV. It is unclear whether it refers to EX on the S4. On S2 p.30 and OM-S4 p.24 the range is 0 – 63, CV is missing, and EX is listed without that note.

UM-S4 p.42 footnotes, verbatim:

> \* An example of the "CX" command is the following, where FADE is the fade time in milliseconds:
> `'CX <Ppos> <Tpos> <Zpos> <Fpos> <Xpos> <OPTIONAL Iris pos> <OPTIONAL PED pos> <OPTIONAL Ypos> <FADE>'`
>
> \*\* The "CV" command is used to move an axis in positional mode and is usually used in instances where continuous position adjustment is required. A new position for a move should be updated at least every 40 milliseconds and position updates should not exceed a total of two seconds, since a move timeout (the controller will respond "TimedOut") occurs two seconds after the last positional command is received.
> To omit an axis from positional mode, fill in its respective position as "0" in the command structure, since the controller will ignore moves to position 0.
> An example of the "CV" command is the following: `'CV <P pos> <T pos> <Z pos> <F pos> <0> <0>'`

| Time     | Command                   |
| -------- | ------------------------- |
| 0 msec   | 'CV 15000 0 0 0 0 0 <CR>' |
| 40 msec  | 'CV 15100 0 0 0 0 0 <CR>' |
| 80 msec  | 'CV 15200 0 0 0 0 0 <CR>' |
| 120 msec | 'CV 15300 0 0 0 0 0 <CR>' |

OM-S4 p.24 gives the same CX line, written as `<OPTIONAL Iris=pos> <OPTIONAL PEDpos>`. S2 p.31 has a "Call & Enter Preset Format: CX … EX …" line, but its placeholders were lost in the silo.tips extraction.

### 7.3 Store, recall, report

Source: UM-S4 p.38–39 (printed 30–31), which is word-for-word the same as S2 p.27–28 and OM-S4 p.21–22.

- Store the current position (UM-S4 p.38): "The 'E' command stores the position of the currently selected camera. Its single parameter is the preset number". Example: `'E 23 <CR>'`.
- Store host-supplied data: `'EX 5 123 456 789 123 456 789 123 456 <CR>'`. Per the manual this "stores a pan position of 123, tilt position of 456, zoom position of 789, focus position of 123, trolley position of 456, iris position of 789, master pedestal position of 123 and dolley position of 456 into preset number 5." The EX parameter order is therefore: `EX <n> <pan> <tilt> <zoom> <focus> <trolley> <iris> <master ped> <dolley>`.
- Recall: `'C 41 <CR>'`. "After the recall is complete, the controller responds with a <CR>." A `<CAN>` during the recall makes the camera "stop where it is and processing will continue as though the camera had actually reached the shot."
- Recall from host data: `'CX 123 456 789 123 456 789 123 456 789 <CR>'`. That is 9 values, matching the footnote order Ppos, Tpos, Zpos, Fpos, Xpos, Iris, PED, Ypos, FADE[ms].
- Report a preset:
  - Host sends `'e 5 <CR>'`. Controller responds `'123 456 789 123 456 789 123 456 <CR>'`. That is 8 values in EX order.
  - The prose says "the four position data … in order of pan, tilt, zoom and focus", which contradicts the 8-value example. _Inferred:_ `e` returns the 8 EX fields.

Consistency note (inferred): EX has 8 position fields; CX has 8 position fields plus FADE, and their order differs after Xpos. Both have the order P, T, Z, F, X(trolley), Iris, Ped, Y. So `e n` output can be fed into `CX` by appending a fade time.

### 7.4 Preset recall speed profile

Recall speed is not a parameter of `C`. It comes from the per-axis "Preset Fade" velocity and acceleration settings (`@?PVH/PVL/PAM`) and the "Preset Cut" settings (`@?CVH/CVL/CAM`). OM-S4 p.30: "Cut is used only with TM-CPS Computer Software." For CX, FADE is given explicitly in ms.

## 8. Velocity / acceleration setup (`@` commands)

Source: UM-S4 p.43 (printed 35); S2 p.31; OM-S4 p.25. In the command names, "?" stands for the axis letter.

| Command* | Parameters               | Description                                                       |
| -------- | ------------------------ | ----------------------------------------------------------------- |
| @VEL=    | See "Description" column | Show Axis Velocity Settings (P=1,T=2,X=3,Z=4,F=5,I=6,Y=7)         |
| @LVEL    | See "Description" column | Load Axis Default Velocity Settings (P=1,T=2,X=3,Z=4,F=5,I=6,Y=7) |
| @?JVH    | 0-2147483647 (2^31)      | Set Axis Maximum Velocity for Joystick Controls                   |
| @?JVL    | 0-2147483647 (2^31)      | Set Axis Minimum Velocity for Joystick Controls                   |
| @?PVH    | 0-2147483647 (2^31)      | Set Axis Maximum Velocity for Preset Fade Shots                   |
| @?PVL    | 0-2147483647 (2^31)      | Set Axis Minimum Velocity for Preset Fade Shots                   |
| @?CVH    | 0-2147483647 (2^31)      | Set Axis Maximum Velocity for Preset Cut Shots                    |
| @?CVL    | 0-2147483647 (2^31)      | Set Axis Minimum Velocity for Preset Cut Shots                    |
| @ACC=    | See "Description" column | Show Axis Acceleration Settings (P=1,T=2,X=3,Z=4,F=5,Y=7)         |
| @LACC    | See "Description" column | Load Axis Default Acceleration Settings (P=1,T=2,X=3,Z=4,F=5,Y=7) |
| @?JAM    | 0-2147483647 (2^31)      | Set Axis Maximum Acceleration for Joystick Controls               |
| @?PAM    | 0-2147483647 (2^31)      | Set Axis Maximum Acceleration for Preset Fade Shots               |
| @?CAM    | 0-2147483647 (2^31)      | Set Axis Maximum Acceleration for Preset Cut Shots                |

\* UM-S4: 'The "?" character in a command indicates that the numerical code for each axis shown in the "Description" column (i.e.; P, T, X, F, I, Z, or Y) can be entered'. OM-S4 p.25 says "? = P,T,Z,F,I,X,Y". _Inferred:_ `?` is replaced by the axis **letter**, for example `@PJVH=…`, by analogy with the documented `@XUW=3000`. Show and load commands take the axis **number**, as in `@VEL=1`. It is not documented whether the set commands use `=`; the documented `@XUW=3000` uses it.

Example responses (OM-S4 p.30, printed 27):

```
@VEL=1
Pan Velocity Setting
Joy Velocity High = 2500000
Joy Velocity Low = 4001
Preset Velocity High = 2500000
Preset Velocity Low = 4001
Cut Velocity High = 2500000
Cut Velocity Low = 4001

@ACC=1
Pan Acceleration Setting
Joy Acceleration Max = 8000
Preset Acceleration Max = 4001
Cut Acceleration Max = 8000
```

OM-S4 p.30: "The joystick mode controls how manual velocity commands are interpreted from a "P" command (joystick). Preset and Cut (preset) are used during call shots."

### 8.1 PID setup

Source: UM-S4 p.44 (printed 36); S2 p.32; OM-S4 p.26. "?" here is P, T, X or Y.

| Command* | Parameters               | Description                                         |
| -------- | ------------------------ | --------------------------------------------------- |
| @PID=    | See "Description" column | Show Axis PID settings (P=1, T=2, X=3, Y=7)         |
| @SET=    | See "Description" column | Burn Axis PID settings (P=1, T=2, X=3, y=7)         |
| @LPID    | See "Description" column | Load Axis Default PID settings (P=1, T=2, X=3, y=7) |
| @?KP=    | 0-32767                  | Set Axis KP (Proportional Gain)                     |
| @?KD=    | 0-32767                  | Set Axis KD (Derivative Gain)                       |
| @?KI=    | 0-32767                  | Set Axis KI (Integral Gain)                         |
| @?IL=    | 0-32767                  | Set Axis IL (Integration Limit)                     |
| @?OL=    | 0-255                    | Set Axis OL (Output Limit)                          |
| @?CL=    | 0-255                    | Set Axis CL (Current Limit)                         |
| @?EL=    | 0-16383                  | Set Axis EL (Position Error Limit)                  |
| @?SR=    | 0-255                    | Set Axis SR (Servo Rate Divisor)                    |
| @?DB=    | 0-255                    | Set Axis DB (Dead Band Compensation)                |

## 9. Soft limits

Source: UM-S4 p.45 (printed 37); S2 p.33–34; OM-S4 p.26 and p.29. "?" here is P, T, X, Z, F or Y.

| Command | Parameters               | Description                                                     |
| ------- | ------------------------ | --------------------------------------------------------------- |
| @LIMS   | see "Description" column | Show Axis Soft Limit (P=1,T=2,X=3,Z=4,F=5,Y=7)                  |
| @LIME   | see "Description" column | Enable Soft End Limit (P=1,T=2,X=3,Z=4,F=5,Y=7)                 |
| @LIMD   | see "Description" column | Disable Soft End Limit (P=1,T=2,X=3,Z=4,F=5,Y=7)                |
| @AUTO   | see "Description" column | Automatically Find Physical End Limit (P=1,T=2,X=3,Z=4,F=5,Y=7) |
| @?LIM   | 1,2                      | Set Window Soft Limit (Upper = 1, Lower = 2)                    |
| @?UW=   | ± 2147483647 (± 2^31)    | Set Axis Upper Window                                           |
| @?LW=   | ± 2147483647 (± 2^31)    | Set Axis Lower Window                                           |

Worked example (S2 p.34 and OM-S4 p.29, verbatim): `@XUW=<value>` Set Upper Window · `@XLIM=1` Set Upper Soft Limit · `@XLW=<value>` Set Lower Window · `@XLIM=2` Set Lower Soft Limit · "example: @XUW=3000" · `@AUTO=3` finds the physical end stops · "IF THE SYSTEM IS CALIBRATED (@ZERO1010), THE SOFT LIMITS WILL NOT WORK PROPERLY. PLEASE RESET THE SOFT LIMITS BY TYPING @AUTO=3".

The status query `@LIMS3` returns:

```
Aux SoftLimit Status/Setting
Limits -> Disable
Upper Physical Limit (1) = 0
Lower Physical Limit (2) = 0
Upper Soft Limit (1) =-2000
Lower Soft Limit (2) =-1000
Upper Window (1) = 2000
Lower Window (2) =-1000
```

The examples show that show commands accept both `@AUTO=3` and `@LIMS3`, with or without `=`.

UM-S4 p.26–27 describes setting the S4 aux soft limits with the Pan/Tilt Configuration Software over Ethernet. That procedure uses a "Pan/Tilt Home" button that "clear[s] all position registers".

## 10. Miscellaneous setup: lens calibration, version, status

Source: UM-S4 p.45–46 (printed 37–38). Differences in S2 p.33 and OM-S4 p.27 are noted below.

| Command | Parameters | Description                                                             |
| ------- | ---------- | ----------------------------------------------------------------------- |
| @PROG   | 1010       | Upload New Firmware to Flash                                            |
| @INIT   | 1010       | Initialize Servos                                                       |
| @ZERO   | 1010       | Calibrate Lens (S4). S2/OM: "Reset Positions and Calibrate Lens"        |
| @CNTR   | 1010       | Reset Positions (Sets Current P/T Head Position to Center). **S4 only** |
| @REFS   | 1010       | Report Digital Pot Settings for Zoom & Focus                            |
| @ZREF   | 0-255      | Set Digital Pot for Zoom                                                |
| @FREF   | 0-255      | Set Digital Pot for Focus                                               |
| @ZRCF   | 1010       | Reads Zoom Correction Factor (S4 and OM; missing in S2)                 |
| @ZGCF   | 0-16383    | Set Zoom Gain Correction Factor                                         |
| @ZOCF   | 0-16383    | Set Zoom Offset Correction Factor                                       |
| @ZTCF   | 0-16383    | Set Zoom Time Correction Factor                                         |
| @VERS   | 1010       | Report Firmware Version                                                 |
| @DIPS   | 1010       | Report Current Dip Switch Status                                        |
| @CAMS   | 1010       | Report Camera Initialization Status                                     |
| @WPCT   | 1010       | Report Weather Proof/Peripheral CMD Enable Status                       |
| @WPCT   | 0          | Use with PT-CP-S2, PT-HP-S2, PT-LP-S2*                                  |
| @WPCT   | 1          | Use with HD-HOU-S2*                                                     |
| @WPCT   | 2          | Use with PT-LP-S3, PT-HP-S2 w/ Contact Closure (CC)*                    |
| @WPCT   | 3          | Use with PT-LWP-S3 Standard w/ Washer*                                  |
| @WPCT   | 4          | Use with PT-LWP-S3 w/ Contact Closure (CC)*                             |
| @WPCT   | 5          | Use with PT-LWP-S3 w/ Stabilizer (Stab.)*                               |
| @WPCT   | 6          | Use with PT-HP-S4, swaps pan/tilt requires a reboot                     |

- Parameter `1010` is a "magic" confirmation value. The full command is the name followed directly by 1010, e.g. `@ZERO1010` and `@VERS1010`, as written in UM-S4 p.32 and S2 p.21.
- OM-S4 p.27 has an older @WPCT version: 1010 = report (1 = Enable, 0 = Disable), 1 = Enable WeatherProof Functions, 0 = Disable.
- UM-S4 p.46 includes a table mapping each @WPCT value to outputs: PT7/J4, PT6/J14, PP7/J13 GPIO and Aux Board 54281. The extraction of that table is garbled. Readable parts:
  - Ext.(G) on PT7 in most configurations.
  - Tally (B) or Wiper (W) on PT6.
  - Washer (U), CC (K) or Stab. (V) on PP7.
  - Aux board: Extender (G), CC "(AUX?) ? = 1,2,3,4".
  - Footnotes: "** These functions are optional and require Interface Board 54250 in the P/T head." "*** This function is optional and requires Interface Board 54249 in the housing."

### Lens calibration

UM-S4 p.32 (printed 24), verbatim steps:

- "Type a lowercase p, followed by the Enter key. A number should be displayed indicating the pan position and communication."
- "Type @ZERO1010 to set the current positions for pan, tilt, and auxiliary axes to zero and calibrate the lens."
- "Wait until the lens has finished its calibration."

**Contradiction:** the S4 command table on p.45 lists `@ZERO` only as "Calibrate Lens" and adds `@CNTR` for "Reset Positions", but the step text on p.32 says @ZERO1010 also zeroes the positions.

OM-S4 p.28 (printed 25), "System Calibration": "@ZERO1010 … sets the current position for pan, tilt and aux … axes to zero. Any presets previously memorized will usually have to be reentered. The second function calibrates the lens. The @ZERO function will first determine the maximum speed of zoom and then the minimum. Finally it will find the end limits of focus. THE LENS CONFIGURATION MUST BE ENTERED PRIOR TO PERFORMING THE LENS CALIBRATION".

S2 p.21: "When calibrating the lens, the pan, tilt, Televator, and track positions will be reset. Stored presets will need to be reentered."

Lens parameter table (OM-S4 p.28): per-lens Zoom Max Vel / Min Vel / Accel / ZREF, Focus Max Vel / Min Vel / Accel / FREF, Iris and DIP direction.

- Contains, among others: "54244 015 Canon J15X8B IAS | 100000 | 50 | 50 | 103 | 12000 | 50 | 50 | 140 | X | X | ON | ON | X" (X = Not Available). For this lens iris is not available through the head.
- Also: "54244 014 Canon J16X8 B4 IASC" and "54244 007 Canon J16Ax8 IASD".
- These values are set through the lens configuration software or the `@Z*`/`@F*` commands, e.g. `@ZJVH`. _Inferred:_ the column-to-command mapping is not stated.

## 11. Zoom / focus / iris / shots at a glance

| Function | Velocity                                         | Absolute position                                                                                                                                                                                                  | Query                                    | Increment             | Other                                                                                      |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| Zoom     | `Z 0–32767` (0 = Tele, 16383 stop, 32767 = Wide) | `CX`/`EX` field 3, `CV` field 3                                                                                                                                                                                    | `z` → 0–1024                             | —                     | `z ±255` PWM; `@ZREF`, `@ZGCF/ZOCF/ZTCF`, `@ZRCF`; `@ZERO1010` calibrate; `G`/`g` extender |
| Focus    | `F 0–32767` (0 = Near, 32767 = Far)              | `CX`/`EX` field 4, `CV` field 4                                                                                                                                                                                    | `f` → 0–1024                             | `FI ±255`             | `f ±255` PWM; `@FREF`                                                                      |
| Iris     | `I 0–32767` (0 = Close, 32767 = Open)            | `CX`/`EX` field 6 ("OPTIONAL Iris pos")                                                                                                                                                                            | `i` → 0–255; `im`/`IM` mode → "IA"/"ILP" | `II ±255` (+ = close) | `IA` auto (camera) / `IL` local (head); master black: `m`, `BI ±255`, CX/EX field 7        |
| Shots    | —                                                | `E n` store current · `EX n p t z f x iris ped y` store data · `C n` recall · `CX p t z f x [iris] [ped] [y] fade_ms` recall data · `CV p t z f 0 0` streamed positional (≥ every 40 ms, 2 s timeout → "TimedOut") | `e n` → 8 values                         | —                     | `<CAN>` 0x18 aborts recall; S4 n = 0–255, S2 n = 0–63                                      |
