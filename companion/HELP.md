## Telemetrics Pan/Tilt

Controls Telemetrics robotic pan/tilt heads over TCP using the Telemetrics ASCII serial protocol (9600 8N1 on the serial side, carried over TCP by the head's network port or a DS-4 device server).

### Configuration

- **IP address / TCP port**: the head or DS-4 port (usually `3001`, DS-4 ports `3001`–`3004`), or an RCCP-1 control panel (usually `2500`).
- **Target**: _Pan/tilt head or DS-4 port_ sends commands directly. _RCCP-1 control panel_ first selects a camera with the STS-12 switch command (`\ 0 <camera> 0 <checksum>`).
- **Take control on connect**: sends `L 1` after connecting.
- **Invert pan / tilt**: flips the direction if the head is mounted differently.
- **Position poll interval**: queries `pt` and fills the position variables. 0 turns polling off.
- **Command prefix**: normally empty. Some Telemetrics servers expect an address such as `P0` before every command.

### Actions

| Action                | Command                                         |
| --------------------- | ----------------------------------------------- |
| Pan/tilt: move        | `P <v> T <v>` (velocity 0–32767, 16383 = still) |
| Pan/tilt: stop        | `R`                                             |
| Pan / Tilt: set speed | `P <v>` / `T <v>`                               |
| Recall shot           | `C<1–240> [0–30 s]`                             |
| RCCP-1: select camera | STS-12 switch command                           |
| Take control          | `L 1`                                           |
| Query position        | `pt`                                            |
| Send raw command      | any text, followed by CR                        |

### Feedbacks and variables

Feedbacks: connected, head moving, last recalled shot, selected camera.
Variables: `pan_position`, `tilt_position`, `last_shot`, `selected_camera`, `last_response`.

### Presets

Direction pad (moves while pressed, stops on release), shots 1–16, cameras 1–8 for the RCCP-1.

### Not covered

Zoom, focus, iris and storing shots are not part of the documented command set. Use _Send raw command_ to try commands on your hardware.
