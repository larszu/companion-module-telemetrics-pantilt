# companion-module-telemetrics-pantilt

Bitfocus Companion module for Telemetrics robotic pan/tilt heads (PT-LP, PT-CP, DS-4) and the RCCP-1 control panel. See [HELP.md](./companion/HELP.md).

Telemetrics no longer supports this hardware. The command set comes from the PT-LP user manual (as used by [telemetrics-moco](https://github.com/shanereetz/telemetrics-moco)) and the RCCP-1 control manual (quoted in [companion-module-requests#1157](https://github.com/bitfocus/companion-module-requests/issues/1157)). Discovery and port numbers were checked against Telemetrics' RCP software.

## Development

```sh
yarn            # install
yarn build      # compile to dist/
yarn test       # protocol tests
yarn package    # telemetrics-pantilt-<version>.tgz for import in Companion
node tools/mock-head.ts 3901   # simulated head for testing without hardware
```

Companion 5 can load the working copy directly with `--extra-module-path` pointing at the parent folder.

## Status

Tested end to end in Companion 5.0.5 against the simulated head. Not yet tested on a real head.

## License

MIT
