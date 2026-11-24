// Keyboard and mouse state for the game: held keys by code, one-shot presses for menus and
// interactions, and the mouse position in screen pixels for aiming on foot.

export class Input {
  constructor(canvas) {
    this.keys = new Set(); // codes currently held down
    this.pressed = new Set(); // codes that went down since the last frame consumed them
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // went down since last frame
    this.enabled = true;

    addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
  }

  /** True while any of the given codes is held. */
  down(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** True once per physical press; consumes the press so menus and doors see it a single time. */
  tap(...codes) {
    for (const code of codes) {
      if (this.pressed.has(code)) {
        this.pressed.delete(code);
        return true;
      }
    }
    return false;
  }

  /** Called at the end of each frame so one-shot state never leaks into the next. */
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
