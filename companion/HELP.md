## Telemetrics Pan/Tilt

Controls Telemetrics robotic pan/tilt heads (S4 generation such as the PT-LP-S4, PT-CP-S4 and PT-HP-S4, and S2 heads) over TCP using the Telemetrics ASCII serial protocol. On the serial side the head runs at 9600 8N1. The TCP connection goes to the head's network port or to a DS-4 device server.

### Configuration

- **IP address / TCP port**: the head or DS-4 port (usually `3001`, DS-4 ports `3001`–`3004`), or an RCCP-1 control panel (usually `2500`).
- **Target**: _Pan/tilt head or DS-4 port_ sends commands directly. _RCCP-1 control panel_ first selects a camera with the STS-12 switch command (`\ 0 <camera> 0 <checksum>`).
- **Send L 1 on connect**: only for older PT-LP heads that need it. S4 heads do not.
- **Invert pan / tilt**: flips the direction if the head is mounted differently.
- **Position poll interval**: queries `p t z f` and fills the position variables. 0 turns polling off.
- **Command prefix**: normally empty. Some Telemetrics servers expect an address such as `P0` before every command.

In direct mode every control command starts with `<CAN>` (0x18). This cancels a running shot recall, because during a recall the head ignores all other commands.

### Actions

| Action                       | Command                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Pan/tilt: move               | `P <v> T <v>` (velocity 0–32767, 16383 = still)                              |
| Stop all motion              | `R`                                                                          |
| Pan / Tilt: set speed        | `P <v>` / `T <v>`                                                            |
| Lens: zoom / focus / iris    | `Z <v>` / `F <v>` / `I <v>`                                                  |
| Lens: focus step / iris step | `FI ±255` / `II ±255`                                                        |
| Lens: iris mode              | `IA` (camera) / `IL` (head)                                                  |
| Lens: extender               | `G` / `g`                                                                    |
| Recall shot                  | `C <0–255>`; through the RCCP-1 optionally with a move time `C <n> <0–30 s>` |
| Store shot                   | `E <0–255>`                                                                  |
| RCCP-1: select camera        | STS-12 switch command                                                        |
| Query position               | `p t z f`                                                                    |
| Send raw command             | any text, followed by CR                                                     |

### Feedbacks and variables

Feedbacks: connected, head moving, last recalled shot, selected camera.
Variables: `pan_position`, `tilt_position`, `zoom_position`, `focus_position`, `last_shot`, `selected_camera`, `last_response`.

### Presets

- Direction pad: moves while pressed, stops on release.
- Zoom and focus: move while pressed.
- Shots 1–16: a short press recalls the shot, holding for 2 seconds stores the current position.
- Cameras 1–8 for the RCCP-1.
