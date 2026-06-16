use parking_lot::Mutex;
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct PointerState {
    pub x: i16,
    pub y: i16,
    pub pressed: bool,
}

#[derive(Clone, Default)]
pub struct MouseState {
    pub x: i16,
    pub y: i16,
    pub left: bool,
    pub right: bool,
    pub wheel_up: bool,
    pub wheel_down: bool,
}

#[derive(Clone, Default)]
pub struct InputState {
    pub buttons: [u16; 8],
    pub analog: [[[i16; 2]; 2]; 8],
    pub pointer: [PointerState; 8],
    pub mouse: [MouseState; 8],
}

pub struct InputManager {
    state: Arc<Mutex<InputState>>,
}

impl InputManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(InputState::default())),
        }
    }

    pub fn set_button(&self, port: u32, id: u32, pressed: bool) {
        let mut state = self.state.lock();
        if (port as usize) < state.buttons.len() {
            if pressed {
                state.buttons[port as usize] |= 1 << id;
            } else {
                state.buttons[port as usize] &= !(1 << id);
            }
        }
    }

    pub fn set_analog(&self, port: u32, index: u32, axis: u32, value: i16) {
        let mut state = self.state.lock();
        if (port as usize) < state.analog.len()
            && (index as usize) < state.analog[port as usize].len()
            && (axis as usize) < state.analog[port as usize][index as usize].len()
        {
            state.analog[port as usize][index as usize][axis as usize] = value;
        }
    }

    pub fn set_pointer_field(&self, port: u32, id: u32, value: i16) {
        let mut state = self.state.lock();
        if (port as usize) < state.pointer.len() {
            match id {
                0 => state.pointer[port as usize].x = value,
                1 => state.pointer[port as usize].y = value,
                2 => state.pointer[port as usize].pressed = value != 0,
                _ => {}
            }
        }
    }

    pub fn set_mouse_field(&self, port: u32, id: u32, value: i16) {
        let mut state = self.state.lock();
        if (port as usize) < state.mouse.len() {
            match id {
                0 => state.mouse[port as usize].x = value,
                1 => state.mouse[port as usize].y = value,
                2 => state.mouse[port as usize].left = value != 0,
                3 => state.mouse[port as usize].right = value != 0,
                4 => state.mouse[port as usize].wheel_up = value != 0,
                5 => state.mouse[port as usize].wheel_down = value != 0,
                _ => {}
            }
        }
    }

    pub fn get_input_state(&self, port: u32, device: u32, index: u32, id: u32) -> i16 {
        let state = self.state.lock();
        match device {
            1 => {
                // JOYPAD
                if (port as usize) < state.buttons.len() {
                    if (state.buttons[port as usize] & (1 << id)) != 0 {
                        1
                    } else {
                        0
                    }
                } else {
                    0
                }
            }
            2 => {
                // MOUSE
                if (port as usize) < state.mouse.len() {
                    let mouse = &state.mouse[port as usize];
                    match id {
                        0 => mouse.x,
                        1 => mouse.y,
                        2 => if mouse.left { 1 } else { 0 },
                        3 => if mouse.right { 1 } else { 0 },
                        4 => if mouse.wheel_up { 1 } else { 0 },
                        5 => if mouse.wheel_down { 1 } else { 0 },
                        _ => 0,
                    }
                } else {
                    0
                }
            }
            5 => {
                // ANALOG
                if (port as usize) < state.analog.len()
                    && (index as usize) < state.analog[port as usize].len()
                    && (id as usize) < state.analog[port as usize][index as usize].len()
                {
                    state.analog[port as usize][index as usize][id as usize]
                } else {
                    0
                }
            }
            6 => {
                // POINTER
                if (port as usize) < state.pointer.len() {
                    let pointer = &state.pointer[port as usize];
                    match id {
                        0 => pointer.x,
                        1 => pointer.y,
                        2 => if pointer.pressed { 1 } else { 0 },
                        _ => 0,
                    }
                } else {
                    0
                }
            }
            _ => 0,
        }
    }
}
