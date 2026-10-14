## Telemetrics Pan/Tilt

Controls Telemetrics robotic pan/tilt heads over TCP: S4/S2 heads (PT-LP-S4, PT-HP-S4, PT-CP-S4), S5 heads (PT-LP-S5, PT-HP-S5, PT-CP-S5, RoboEye2), heads behind a DS-4 device server or a network–serial bridge, the RCCP-1 control panel and the automation port of the Telemetrics RCP software. The serial side of a head runs at 9600 8N1.

### Configuration

- **Found on the network**: devices that answered the UDP 2000 discovery. Choose one, or _Enter manually_ and type IP address and port. The list is refreshed when the module starts and with the action _Scan network_.
- **Target**
  - _Pan/tilt head, DS-4 port or serial bridge_: port `3001` (DS-4 ports `3001`–`3004`, a serial bridge any port).
  - _RCCP-1 control panel_: port `2500`. A camera is selected with STS-12 first.
  - _RCP automation port_: port `5000`. Shot recall only: `P<page> C<shot> T<seconds>`.
- **Head generation**: S4/S2 or S5. Decides focus/iris handling, keyframe moves and column homing.
- **DS-4 port ownership**: _Show owner only_ or _Take over the port on connect_ (disconnects another controller such as RCP).
- **Motion**: invert pan/tilt, the column axis (`X`, `Y` or `Q`), attack and release times and the ease curve of all speed changes.
- **Shot storage**
  - _Module_: the module reads the position and stores it with a move time. Recall is an absolute move (`CX`) in that time; on S5 heads it can be an eased keyframe stream instead.
  - _Head memory_: the head stores and recalls its own presets (`E n` / `C n`).
- **Allow soft limit enable/disable**: off by default. Showing the limits is always possible. Writing limit values is not supported.
- **Command prefix**: normally empty. Some Telemetrics servers expect an address such as `P0`.

Every control line to a head starts with `<CAN>` (0x18). This cancels a running shot recall, because during a recall the head ignores all other commands.

### Actions

| Action                                 | What happens                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Pan/tilt: move / stop (ramped)         | `P<v>T<v>` with attack and release ramp                                              |
| Stop all motion                        | `R`, all axes neutral, cancels shot moves, aborts column homing                      |
| Pan / Tilt: set speed                  | signed speed, for rotary encoders                                                    |
| Lens: zoom / focus / iris              | while pressed; S5 focus/iris as repeated `FI`/`II` steps                             |
| Lens: zoom speed / focus speed         | signed speed                                                                         |
| Lens: focus step / iris step           | `FI ±255` / `II ±255`                                                                |
| Lens: iris mode, extender              | `IA` / `IL`, `G` / `g`                                                               |
| Column: up / down, set speed           | aux axis velocity (`X` by default)                                                   |
| Shot: recall                           | module: `CX` or keyframes in the stored time (override possible); head: `C n`        |
| Shot: store, delete                    | module: pose + move time; head: `E n`                                                |
| Shot: cancel running move              | `<CAN>`, stops a keyframe stream                                                     |
| Column homing 1/2 arm, 2/2 confirm     | S5 only. Arm opens a 10 s window, confirm starts `@CNTR 1010`. Clear the area first. |
| Column homing: abort / disarm          | `@CNTR 1011`                                                                         |
| Soft limits                            | show `@LIMS<n>`; enable `@LIME<n>` / disable `@LIMD<n>` only if allowed              |
| RCCP-1: select camera                  | STS-12 switch command                                                                |
| Query position, Scan network, Send raw | `ptzfxymi`, UDP 2000 broadcast, any text + CR                                        |

After column homing, verify the soft limits: homing re-references the column, the limit values stay as they are.

### Feedbacks and variables

Feedbacks: connected, head moving, current shot (any status / moving / on shot / off shot / sent), shot stored, column homing phase, soft limits enabled, RCCP-1 camera selected.

Variables: `pan_position`, `tilt_position`, `zoom_position`, `focus_position`, `column_position`, `aux_y_position`, `iris_position`, `black_position`, `current_shot`, `shot_status`, `column_home_phase`, `column_home_state`, `limits_axis`, `limits_enabled`, `limits_upper`, `limits_lower`, `limits_text`, `system_error`, `ds4_owner`, `discovered`, `selected_camera`, `last_response`.

### Presets

- Direction pad: soft start while pressed, glides to a stop on release. STOP stops everything at once.
- Lens: zoom, focus, iris while pressed; zoom/focus position.
- Column: up/down while pressed, position, homing arm/confirm/abort.
- Shots 1–16: a short press recalls, holding for 2 seconds stores. Grey text = empty, orange = moving, red = on shot.
- Soft limits of the column: show, enable, disable.
- RCCP-1 cameras 1–8.

### Network–serial bridge

Raw TCP server, 9600 8N1, no flow control, RS-422 (or RS-232 on short runs), one head per port, no inactivity timeout. Pinout and packing: see the README in the repository.
