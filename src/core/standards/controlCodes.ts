import type { ControlCode, ControlCodeCategory, PresentationLevel } from "../model/types";

const LEVEL_1_AND_UP: PresentationLevel[] = ["1", "1.5", "2.5", "3.5"];

function controlCode(
  byte: number,
  mnemonic: string,
  category: ControlCodeCategory,
  label: string,
  description: string
): ControlCode {
  return {
    id: mnemonic.toLowerCase().replaceAll("_", "-"),
    byte,
    mnemonic,
    category,
    label,
    supportedLevels: LEVEL_1_AND_UP,
    description
  };
}

export const LEVEL_1_CONTROL_CODES: ControlCode[] = [
  controlCode(0x00, "ALPHA_BLACK", "colour", "Alpha black", "Select alphanumeric mode with black foreground."),
  controlCode(0x01, "ALPHA_RED", "colour", "Alpha red", "Select alphanumeric mode with red foreground."),
  controlCode(0x02, "ALPHA_GREEN", "colour", "Alpha green", "Select alphanumeric mode with green foreground."),
  controlCode(0x03, "ALPHA_YELLOW", "colour", "Alpha yellow", "Select alphanumeric mode with yellow foreground."),
  controlCode(0x04, "ALPHA_BLUE", "colour", "Alpha blue", "Select alphanumeric mode with blue foreground."),
  controlCode(0x05, "ALPHA_MAGENTA", "colour", "Alpha magenta", "Select alphanumeric mode with magenta foreground."),
  controlCode(0x06, "ALPHA_CYAN", "colour", "Alpha cyan", "Select alphanumeric mode with cyan foreground."),
  controlCode(0x07, "ALPHA_WHITE", "colour", "Alpha white", "Select alphanumeric mode with white foreground."),
  controlCode(0x08, "FLASH", "flash", "Flash", "Start flashing display for following cells."),
  controlCode(0x09, "STEADY", "flash", "Steady", "Return following cells to steady display."),
  controlCode(0x0a, "END_BOX", "box", "End box", "End boxed display mode."),
  controlCode(0x0b, "START_BOX", "box", "Start box", "Start boxed display mode."),
  controlCode(0x0c, "NORMAL_SIZE", "size", "Normal size", "Return following cells to normal size."),
  controlCode(0x0d, "DOUBLE_HEIGHT", "size", "Double height", "Render following cells as double-height characters."),
  controlCode(0x0e, "DOUBLE_WIDTH", "size", "Double width", "Render following cells as double-width characters where supported."),
  controlCode(0x0f, "DOUBLE_SIZE", "size", "Double size", "Render following cells as double-height and double-width where supported."),
  controlCode(0x10, "GRAPHICS_BLACK", "graphics", "Graphics black", "Select mosaic graphics mode with black foreground."),
  controlCode(0x11, "GRAPHICS_RED", "graphics", "Graphics red", "Select mosaic graphics mode with red foreground."),
  controlCode(0x12, "GRAPHICS_GREEN", "graphics", "Graphics green", "Select mosaic graphics mode with green foreground."),
  controlCode(0x13, "GRAPHICS_YELLOW", "graphics", "Graphics yellow", "Select mosaic graphics mode with yellow foreground."),
  controlCode(0x14, "GRAPHICS_BLUE", "graphics", "Graphics blue", "Select mosaic graphics mode with blue foreground."),
  controlCode(0x15, "GRAPHICS_MAGENTA", "graphics", "Graphics magenta", "Select mosaic graphics mode with magenta foreground."),
  controlCode(0x16, "GRAPHICS_CYAN", "graphics", "Graphics cyan", "Select mosaic graphics mode with cyan foreground."),
  controlCode(0x17, "GRAPHICS_WHITE", "graphics", "Graphics white", "Select mosaic graphics mode with white foreground."),
  controlCode(0x18, "CONCEAL", "conceal", "Conceal", "Conceal following display until reveal is active."),
  controlCode(0x19, "CONTIGUOUS_GRAPHICS", "graphics", "Contiguous graphics", "Use contiguous mosaic graphics shapes."),
  controlCode(0x1a, "SEPARATED_GRAPHICS", "graphics", "Separated graphics", "Use separated mosaic graphics shapes."),
  controlCode(0x1b, "ESCAPE", "charset", "Escape", "Select alternate character set behavior where supported."),
  controlCode(0x1c, "BLACK_BACKGROUND", "background", "Black background", "Use black background for following cells."),
  controlCode(0x1d, "NEW_BACKGROUND", "background", "New background", "Use current foreground as new background."),
  controlCode(0x1e, "HOLD_GRAPHICS", "hold", "Hold graphics", "Hold the most recent mosaic for following spacing cells."),
  controlCode(0x1f, "RELEASE_GRAPHICS", "release", "Release graphics", "Stop holding mosaic graphics.")
];

const CONTROL_CODES_BY_BYTE = new Map(
  LEVEL_1_CONTROL_CODES.map((code) => [code.byte, code])
);

export function getControlCodeByByte(byte: number): ControlCode | undefined {
  return CONTROL_CODES_BY_BYTE.get(byte);
}
