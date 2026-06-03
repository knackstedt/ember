use parking_lot::Mutex;
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct InputState {
    pub buttons: [u16; 8],
    pub analog: [[[i16; 2]; 2]; 8],
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
            _ => 0,
        }
    }
}
