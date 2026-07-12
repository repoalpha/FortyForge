# Mosaic Pattern Off State Design

## Goal

Mosaic pattern presets should behave as latched modes that can also be switched off. No mosaic painting mode should be active until the author explicitly activates one. Once activated, a mode stays active until the author chooses another mode or clicks the active preset again to turn it off.

## Behavior

- The Mosaic paint mode has three states: inactive, freestyle, and preset.
- Inactive is the initial state.
- Clicking `Freestyle` activates manual sixel editing.
- Clicking a preset activates that preset and keeps it selected for repeated stamping.
- Clicking the active preset again returns to inactive, with no paint mode selected.
- While inactive, canvas and grid clicks only select cells; they do not toggle sixels or stamp presets.
- Existing teletext data commands remain unchanged. This is an editor interaction state change only.

## UI

- `Freestyle` is only highlighted when active.
- A preset is only highlighted while latched.
- When inactive, neither `Freestyle` nor any preset is highlighted.
- The Mosaic tool can still be selected without automatically enabling a paint mode.

## Testing

- Add or update tests to confirm the initial Mosaic paint mode is inactive.
- Add a regression test that clicking the selected preset again unlatches it and prevents further painting.
- Keep existing preset latching, preset stamping, arrow-repeat stamping, and freestyle sixel editing tests passing after they explicitly activate the relevant mode.
