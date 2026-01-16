import { makePersisted } from "@solid-primitives/storage"
import { batch, createContext, createEffect, createMemo, createSignal, For, onMount, Show, useContext, type JSX } from "solid-js"
import { createStore } from "solid-js/store"

const gen_line_id = (() => {
    let id = 0
    return () => ++id
})()

function line(content: string) {
    return { id: gen_line_id(), content }
}
type LineId = number
type Line = { id: LineId, content: string }
type Mode = 'normal' | 'edit' | 'command'

type Motion = 'replace' | 'yank' | 'delete' | 'change' | null

type EditorState = {
  has_unsaved_changes: boolean
  g_mode: boolean
  camera_y: number
  motion: Motion
  mode: Mode
  command: string
  i_line: number
  i_cursor: number
  lines: Line[]
  yank: string | undefined
}

type EditorProps = { 
    on_set_column_under_cursor: (_: string) => void, 
    on_save_program: (_: string) => void 
    on_command_execute: (_: string) => boolean
}

export function Editor(props: EditorProps) {
    return (<>
        <EditorProvider>
            <EditorWithParser {...props}></EditorWithParser>
        </EditorProvider></>
    )
}

function EditorWithParser(props: EditorProps) {

    const [state , { 
        load_program, 
        handle_key_down, 
        set_on_save_program_callback,
        set_on_column_under_cursor_callback,
        set_on_cursor_change_callback,
        set_on_command_execute_callback,
        scroll_camera_y
    }] = useEditor()

  onMount(() => {
    focus_on_editor()
    set_on_save_program_callback(props.on_save_program)
    set_on_column_under_cursor_callback(props.on_set_column_under_cursor)


    set_on_cursor_change_callback(on_cursor_change)

    set_on_command_execute_callback(props.on_command_execute)

    load_program()
  })

  const on_cursor_change = () => {

    if (state.i_line < state.camera_y + 3) {
      scroll_camera_y(state.i_line - 3)
    } else
    if (state.i_line > (state.camera_y + 20)) {
      scroll_camera_y(state.i_line - 20)
    }
  }

  let $el!: HTMLDivElement
  let focus_on_editor = () => $el.focus()

  let [on_focus, set_on_focus] = createSignal(false)

  return (<>
  <div ref={$el} tabIndex={1} onFocus={() => set_on_focus(true)} onBlur={() => set_on_focus(false)} class='flex flex-col space-mono-regular editor bg-slate-800 w-full h-full text-white cursor-text' onMouseDown={() => focus_on_editor} onKeyDown={handle_key_down}>
    <div class='flex flex-col overflow-hidden w-100'>
    <For each={state.lines}>{ (block, i) => 
        <Show when={i() >= state.camera_y}>
            <Block mode={state.mode} block={block} cursor={i() === state.i_line ? state.i_cursor : undefined} on_focus={on_focus()} />
        </Show>
    }</For>
    </div>
    <div class='flex-1 bg-slate-800'></div>
    <div class={`flex ${state.mode === 'edit' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
      {state.mode === 'command' ? ':' + state.command : state.mode}
    </div>
  </div>
  </>)
}

function Block(props: { block: Line, cursor?: number, mode: Mode, on_focus: boolean }) {

  const [editor] = useEditor()
  let chars = createMemo(() => props.block.content === '' ? [] : props.block.content.split(''))
  const meta = createMemo(() => editor.meta[props.block.id])

  const in_token = (i: number) => meta()?.tokens.find(_ => _.begin_char <= i && i < _.end_char)
  return (<>
    <div class='whitespace-pre'>
      <For each={chars()}>{(char, i) =>
        <Char in_token={in_token(i())} char={char} cursor={i() === props.cursor ? { mode: props.mode } : undefined} on_focus={props.on_focus}></Char>
      }</For>
        <Char char={' '} cursor={chars().length === props.cursor ? { mode: props.mode } : undefined} on_focus={props.on_focus} ></Char>
    </div>
  </>)
}

function Char(props: { in_token?: Token, char: string, cursor?: Cursor, on_focus: boolean }) {
  const highlight = createMemo(() => {
    switch (props.in_token?.type) {
      case TokenType.BeginFact:
        return 'text-emerald-500'
      case TokenType.BeginIdea:
        return 'text-amber-500'
      case TokenType.BeginLegal:
        return 'text-gray-300'
      default:
        return 'text-gray-400'
    }
  })
  return (<><span class='relative'>
    <Show when={props.cursor}>{cursor =>
      <Cursor cursor={cursor()} char={props.char} blink={props.on_focus} />
    }</Show>
    <span class={`relative ${highlight()}`}>{props.char}</span>
  </span></>)
}

type Cursor = {
  mode: Mode
}
function Cursor(props: { cursor: Cursor, char: string, blink?: boolean }) {
  return <span class={`cursor ${props.blink ? 'animate-blink' : ''} left-0 absolute h-full ${props.cursor.mode === 'normal' ? 'w-full bg-amber-800' : 'w-0.5 bg-emerald-500'}`}></span>
}



type ParseState = {
    in_fact: boolean
    in_idea: boolean
    in_legal: boolean
    line: number
}

function state_equal(a: ParseState, b: ParseState) {
    if (a.in_fact === b.in_fact) {
        if (a.in_idea === b.in_idea) {
            if (a.in_legal === b.in_legal) {
                return true
            }
        }
    }
    return false
}

type LineMetadata = {
    line: number
    tokens: Token[]
}

enum TokenType {
    Whitespace = 'Whitespace',
    BeginFact = 'Fact',
    BeginIdea = 'Idea',
    BeginLegal = 'Legal',
    Path = 'Path',
    Newline = 'Newline'
}

type Token = {
    type: TokenType
    begin_char: number
    end_char: number
    value: string
}



type EditorStoreState = {
  has_unsaved_changes: boolean
  camera_y: number
  meta: Record<LineId, LineMetadata>
  command: string
  i_cursor: number
  i_line: number
  lines: Line[]
  mode: Mode
}

type EditorStoreActions = {
    load_program(): void
    handle_key_down: (e: KeyboardEvent) => void
    set_on_save_program_callback: (fn: (_: string) => void) => void
    set_on_column_under_cursor_callback: (fn: (_: string) => void) => void
    set_on_cursor_change_callback: (fn: () => void) => void
    set_on_command_execute_callback: (fn: (_: string) => boolean) => void
    scroll_camera_y: (_: number) => boolean
}

type EditorStore = [EditorStoreState, EditorStoreActions]

const EditorContext = createContext<EditorStore>()

const EditorProvider = (props: { children: JSX.Element }) => {
    return (
        <EditorContext.Provider value={createEditorStore()}>
            {props.children}
        </EditorContext.Provider>
    )
}
type ParserStoreState = {
    meta: Record<LineId, LineMetadata>
    states: Record<LineId, ParseState>
}
const useEditor = () => useContext(EditorContext)!

function createEditorStore(): EditorStore {

    let [parser_state, set_parser_state] = createStore<ParserStoreState>({
        meta: [],
        states: []
    })

  let first_line: Line = line('hello')
  const [state, set_state] = createStore<EditorState>({
    has_unsaved_changes: false,
    g_mode: false,
    camera_y: 0,
    motion: null,
    command: '',
    mode: 'normal',
    i_line: 0,
    i_cursor: 0,
    lines: [first_line],
    yank: undefined
  })

  const scroll_camera_y = (delta: number) => {
    let tmp = state.camera_y
    set_state('camera_y', Math.min(Math.max(0, delta), state.lines.length))
    let now = state.camera_y

    return tmp !== now
  }

  const clamp_cursor_to_line = () => {
    batch(() => {
      if (state.i_line < 0) {
        set_state('i_line', 0)
      }
      if (state.i_line >= state.lines.length) {
        set_state('i_line', state.lines.length - 1)
      }
      if (state.lines.length === 0) {
        set_state('lines', [line('hello')])
        set_state('i_line', 0)
        set_state('i_cursor', 0)
      } else if (state.i_cursor >= state.lines[state.i_line].content.length) {
        set_state('i_cursor', state.lines[state.i_line].content.length - 1)
      }

      if (state.i_cursor < 0) {
        set_state('i_cursor', 0)
      }
      set_column_under_cursor()
    })
  }

  const break_line_and_goto_it = () => {
    let content = state.lines[state.i_line].content.slice(0, state.i_cursor)
    let new_content = state.lines[state.i_line].content.slice(state.i_cursor)

    batch(() => {
        let i_line = state.i_line
        set_state('lines', state.i_line, 'content', content)
        set_state('lines', lines =>
            lines.toSpliced(state.i_line + 1, 0, line(new_content))
        )
        set_state('i_line', state.i_line + 1)
        set_state('i_cursor', 0)

        set_change_line(i_line)
      on_cursor_change()
    })
  }

  const join_lines = () => {
    let content = state.lines[state.i_line].content
    let content2 = state.lines[state.i_line + 1].content


    batch(() => {
        let i_line = state.i_line
        set_state('lines', state.i_line, 'content', content + content2)
        set_state('lines', lines =>
            lines.toSpliced(state.i_line + 1, 1)
        )
        set_state('i_line', state.i_line)
        set_state('i_cursor', content.length)

        set_change_line(i_line)
    })
  }

  const delete_text_forward = () => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor) + content.slice(state.i_cursor + 1)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
    })
  }

  const delete_j_motion = () => {
    batch(() => {
      set_state('motion', null)

      delete_full_line()
      delete_full_line()
    })
  }

  const delete_k_motion = () => {
    batch(() => {
      set_state('motion', null)

      set_state('i_line', state.i_line - 1)
      delete_full_line()
      delete_full_line()
      set_state('i_line', state.i_line + 1)
    })
  }

  const delete_line_between = (a: number, b: number) => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, a) + content.slice(b)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
    })
  }

  const change_full_line = () => {
    batch(() => {
      let inserted_line = line('')
      if (state.lines.length === 1) {
        set_state('lines', [inserted_line])
        return
      }
      set_state('lines',
        lines => lines.toSpliced(state.i_line, 1, inserted_line))
        clamp_cursor_to_line()

      set_state('mode', 'edit')
    })
  }


  const yank_full_line = () => {
    batch(() => {
      set_state('yank', state.lines[state.i_line].content)
    })
  }
  const yank_line_between = (a: number, b: number) => {
    batch(() => {
      set_state('yank', state.lines[state.i_line].content.slice(a, b))
    })
  }




  const delete_full_line = () => {
    batch(() => {
      if (state.lines.length === 1) {
        set_state('lines', [line('hello')])
        return
      }
      set_state('lines',
        lines => lines.toSpliced(state.i_line, 1))
        clamp_cursor_to_line()
    })
  }

  const delete_rest_of_the_line = () => {
    let content = state.lines[state.i_line].content.slice(0, state.i_cursor)

    batch(() => {
      set_state('lines', state.i_line, 'content', content)
      clamp_cursor_to_line()
    })
  }

  const delete_rest_of_the_line_and_enter_insert = () => {
    batch(() => {
      delete_rest_of_the_line()
      set_state('mode', 'edit')
    })
  }

  const delete_text_backspace = () => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor - 1) + content.slice(state.i_cursor)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor - 1)
    })
  }

  const delete_until_beginning_of_file = () => {
    batch(() => {
      set_state('lines', lines =>
        lines.toSpliced(0, state.i_line)
      )
      set_state('i_line', 0)
      clamp_cursor_to_line()
      set_change_line(0)
    })
  }

  const delete_until_end_of_file = () => {
    batch(() => {
      let i_line = state.i_line
      set_state('lines', lines =>
        lines.toSpliced(state.i_line, 999)
      )
      set_state('i_line', 999)
      clamp_cursor_to_line()
      set_change_line(i_line)
    })
  }

  const enter_newline_and_goto_it = () => {
    batch(() => {
      set_state('lines', lines =>
        lines.toSpliced(state.i_line + 1, 0, line(''))
      )
      set_state('i_line', state.i_line + 1)
      set_state('i_cursor', 0)
      set_change_line(state.i_line - 1)
      on_cursor_change()
    })
  }

  const enter_newline_and_stay = () => {
    batch(() => {
      set_state('lines', lines =>
        lines.toSpliced(state.i_line, 0, line(''))
      )
      set_change_line(state.i_line)
      clamp_cursor_to_line()
      on_cursor_change()
    })
  }

  const paste_text = () => {
    let key = state.yank ?? ''
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor) + key + content.slice(state.i_cursor)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor + 1)

      set_change_line(state.i_line)
    })
  }

  const insert_bunch_of_text = (text: string) => {

    let lines = text.split("\n")
    batch(() => {
      let i_line = state.i_line

      let content = state.lines[state.i_line].content
      let new_content = content.slice(0, state.i_cursor) + lines[0] + content.slice(state.i_cursor)

      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor + lines[0].length)

      for (let l of lines.slice(1)) {
        set_state('lines', lines =>
            lines.toSpliced(state.i_line + 1, 0, line(l))
        )
        set_state('i_cursor', l.length)
        set_state('i_line', state.i_line + 1)
      }


      set_change_line(i_line)
      on_cursor_change()
    })
  }

  const replace_char = (key: string) => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor) + key + content.slice(state.i_cursor + 1)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_change_line(state.i_line)
    })
  }


  const insert_text = (key: string) => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor) + key + content.slice(state.i_cursor)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor + 1)

      set_change_line(state.i_line)

      on_cursor_change()
    })
  }

  const handle_key_down = (e: KeyboardEvent) => {
    let handled = false
    if (state.mode === 'command') {
      handled = command_mode(e.key)
    } else if (state.mode === 'edit') {
      handled = edit_mode(e.key, e.ctrlKey, e.shiftKey)
    } else if (state.mode === 'normal') {
      handled = normal_mode(e.key, e.ctrlKey, e.shiftKey)
    }
    if (handled) {
      e.preventDefault()
    }
  }

  const command_mode = (key: string) => {
    switch (key) {
      case 'Escape':
        set_state('command', '')
        set_state('mode', 'normal')
        break
      case 'w':
        set_state('command', 'w')
        break
      case 'Enter':
        execute_command()
        set_state('command', '')
        set_state('mode', 'normal')
        break
      default:
        if (/[A-Za-z0-9]/.test(key)) {
          set_state('command', state.command + key)
        }
        return false
    }
    return true
  }

  const [persisted_program, set_persisted_program] = makePersisted(createStore({
    program: 'hello',
    i_cursor: 0,
    i_line: 0,
    camera_y: 0,
  }), {
    name: '.morchess4.program'
  })

  const load_program = () => {
    let lines = persisted_program.program.split('\n').map(content => line(content))

    batch(() => {
      set_state('lines', lines)
      set_state('i_line', persisted_program.i_line)
      set_state('i_cursor', persisted_program.i_cursor)
      set_state('camera_y', persisted_program.camera_y ?? 0)

      load_parser(state.lines)

    })
    on_save_program_callback(get_full_program())
  }

  const get_full_program = () => {
    return state.lines.map(line => line.content).join('\n')
  }

  const execute_command = () => {
    if (state.command === 'w') {
      batch(() => {
        set_persisted_program('program', get_full_program())
        set_persisted_program('i_cursor', state.i_cursor)
        set_persisted_program('i_line', state.i_line)
        set_persisted_program('camera_y', state.camera_y)
        save_program()
      })
      return true
    }
    return on_command_execute_callback(state.command)
  }

  const enter_delete_motion = () => {

    if (state.motion === 'delete') {
      batch(() => {
        set_state('motion', null)
      })
      delete_full_line()
    } else {
        set_state('motion', 'delete')
    }
  }
  const enter_change_motion = () => {

    if (state.motion === 'change') {
      batch(() => {
        set_state('motion', null)
      })
      change_full_line()
    } else {
        set_state('motion', 'change')
    }
  }
  const enter_yank_motion = () => {

    if (state.motion === 'yank') {
      batch(() => {
        set_state('motion', null)
      })
      yank_full_line()
    } else {
        set_state('motion', 'yank')
    }
  }

  const enter_replace_motion = () => {

    if (state.motion === 'replace') {
      batch(() => {
        set_state('motion', null)
      })
    } else {
        set_state('motion', 'replace')
    }
  }






  const normal_mode_ctrl_down = (key: string) => {
    switch (key) {
      case 'u':
        batch(() => {
          set_state('i_line', state.i_line - 13)
          clamp_cursor_to_line()
        })
        break
        case 'd':
        batch(() => {
          set_state('i_line', state.i_line + 13)
          clamp_cursor_to_line()
        })
          break
      default:
        return false
    }
    return true
  }


  const normal_mode = (key: string, is_ctrl_down: boolean, is_shift_down: boolean) => {
    if (is_ctrl_down) {
      return normal_mode_ctrl_down(key)
    }

    if (state.motion === 'replace') {

      if (key.length === 1 && /[A-Za-z0-9]/.test(key)) {
        batch(() => {
          replace_char(key)
        })

        set_state('motion', null)
        return
      }
    }

    switch (key) {
      case 'g':
      case 'G':
        if (is_shift_down) {
          if (state.motion === 'delete') {
            delete_until_end_of_file()
            set_state('motion', null)
            break
          }
          batch(() => {
            set_state('i_line', 999)
            set_state('i_cursor', 999)
            clamp_cursor_to_line()
            set_state('g_mode', false)
          })
          break
        }
        if (state.g_mode) {
          if (state.motion === 'delete') {
            delete_until_beginning_of_file()
            set_state('motion', null)
            break
          }
          batch(() => {
            set_state('i_line', 0)
            set_state('i_cursor', 0)
            clamp_cursor_to_line()
            set_state('g_mode', false)
          })
        } else {
          set_state('g_mode', true)
        }
        break
      case ':':
        set_state('mode', 'command')
        break
      case 'p':
      case 'P':
        paste_text()
        break
      case 'y':
      case 'Y':
        enter_yank_motion()
        break
      case 'r':
      case 'R':
        enter_replace_motion()
        break
      case 'c':
      case 'C':
        if (is_shift_down) {
          delete_rest_of_the_line_and_enter_insert()
        } else {
          enter_change_motion()
        }
        break
      case 'd':
      case 'D':
        if (is_shift_down) {
          delete_rest_of_the_line()
        } else {
          enter_delete_motion()
        }
        break
      case 'x':
        delete_text_forward()
        break
      case 'Backspace':
        batch(() => {
          set_state('i_cursor', state.i_cursor - 1)
          clamp_cursor_to_line()
        })
        break
      case 'o':
      case 'O':
        batch(() => {
          if (is_shift_down) {
            enter_newline_and_stay()
          } else {
            enter_newline_and_goto_it()
          }
          set_state('mode', 'edit')
        })
        break
      case 'j':
      case 'J':
        if (is_shift_down) {
          join_lines()
          break
        }
        if (state.motion === 'delete') {
          batch(() => {
            delete_j_motion()
            clamp_cursor_to_line()
          })
          break
        }
        batch(() => {
          set_state('i_line', state.i_line + 1)
          clamp_cursor_to_line()
        })
        break
      case 'k':
        if (state.motion === 'delete') {
          batch(() => {
            delete_k_motion()
            clamp_cursor_to_line()
          })
          break
        }
        batch(() => {
          set_state('i_line', state.i_line - 1)
          clamp_cursor_to_line()
        })
        break
      case 'a':
      case 'A':
        batch(() => {
          set_state('i_cursor', is_shift_down ? state.lines[state.i_line].content.length : state.i_cursor + 1)
          set_state('mode', 'edit')
        })
        break
      case 'i':
        set_state('mode', 'edit')
        break
      case 'l':
        batch(() => {
          set_state('i_cursor', state.i_cursor + 1)
          clamp_cursor_to_line()
        })
        break
      case 'h':
        batch(() => {
          set_state('i_cursor', state.i_cursor - 1)
          clamp_cursor_to_line()
        })
        break
      case 'w':
        batch(() => {
          let a = state.i_cursor
          let i_next_cursor = get_cursor_next_word_beginning(state.i_cursor)
          if (i_next_cursor === state.lines[state.i_line].content.length) {

            if (state.motion === 'delete') {
              delete_line_between(a, i_next_cursor)
              set_state('i_cursor', a)
              return
            }
            if (state.motion === 'change') {
              delete_line_between(a, i_next_cursor)
              set_state('i_cursor', a)
              set_state('mode', 'edit')
              return
            }

            set_state('i_line', Math.min(state.lines.length - 1, state.i_line + 1))
            i_next_cursor = get_cursor_next_word_beginning(0, false)
          }
          set_state('i_cursor', i_next_cursor)
          clamp_cursor_to_line()

          let b = i_next_cursor
          if (state.motion === 'change') {
            delete_line_between(a, b)
            set_state('i_cursor', a)
            set_state('mode', 'edit')
          }
          if (state.motion === 'delete') {
            delete_line_between(a, b)
            set_state('i_cursor', a)
          }
        })
        break
      case '_':
        batch(() => {
          let a = state.i_cursor
          let i_next_cursor = get_cursor_underscore_beginning()
          set_state('i_cursor', i_next_cursor)
          let b = i_next_cursor

          if (state.motion === 'change') {
            delete_line_between(b, a)
            set_state('i_cursor', b)
            set_state('mode', 'edit')
          }
          if (state.motion === 'delete') {
            delete_line_between(b, a)
            set_state('i_cursor', b)
          }
        })
        break
      case 'b':
        batch(() => {
          let a = state.i_cursor
          let i_next_cursor = get_cursor_previous_word_beginning(state.i_cursor)
          if (i_next_cursor === 0) {
            if (state.motion === 'delete') {
              delete_line_between(0, a)
              set_state('i_cursor', 0)
              return
            }
            if (state.motion === 'change') {
              delete_line_between(0, a)
              set_state('i_cursor', 0)
              set_state('mode', 'edit')
              return
            }
            if (state.i_line === 0) {
              i_next_cursor = 0
            } else {
              set_state('i_line', state.i_line - 1)
              i_next_cursor = get_cursor_previous_word_beginning(state.lines[state.i_line].content.length, false)
            }
          }
          set_state('i_cursor', i_next_cursor)
          clamp_cursor_to_line()

          let b = i_next_cursor
          if (state.motion === 'change') {
            delete_line_between(b, a)
            set_state('i_cursor', b)
            set_state('mode', 'edit')
          }
          if (state.motion === 'delete') {
            delete_line_between(b, a)
            set_state('i_cursor', b)
          }
        })
        break
      case '0':
        set_state('i_cursor', 0)
        break
      case '$':
        batch(() => {
          let a = state.i_cursor
          set_state('i_cursor', 999)
          clamp_cursor_to_line()
          let b = state.i_cursor + 1
          if (state.motion === 'change') {
            delete_line_between(a, b)
            set_state('i_cursor', a)
            set_state('mode', 'edit')
          }
          if (state.motion === 'delete') {
            delete_line_between(a, b)
            set_state('i_cursor', a)
          }
          if (state.motion === 'yank') {
            yank_line_between(a, b)
          }
        })
        break
      default:
        return false
    }

    if (key !== 'r' && key !== 'R') {
      if (state.motion === 'replace') {
        set_state('motion', null)
      }
    }

    if (key !== 'c' && key !== 'C') {
      if (state.motion === 'change') {
        set_state('motion', null)
      }
    }

    if (key !== 'd' && key !== 'D') {
      if (state.motion === 'delete') {
        set_state('motion', null)
      }
    }

    if (key !== 'y' && key !== 'Y') {
      if (state.motion === 'yank') {
        set_state('motion', null)
      }
    }

    return true
  }

  const get_cursor_next_word_beginning = (cursor: number, skip_self = true) => {
    let line = state.lines[state.i_line].content
    while (cursor < line.length) {
        let check = /[A-Za-z0-9]/.test(line[cursor])
        if (check && skip_self) {
          cursor++
            continue
        }
        skip_self = false
        if (check) {
            break
        }
        cursor++
    }
    return cursor
  }

  const get_cursor_underscore_beginning = () => {
    let line = state.lines[state.i_line].content
    for (let i = 0; i < line.length; i++) {
      if (/[A-Za-z0-9]/.test(line[i])) {
        return i
      }
    }
    return 0
  }

  const get_cursor_previous_word_beginning = (cursor: number, skip_self = true) => {
    let line = state.lines[state.i_line].content
    while (cursor > 0) {
        let check = /[A-Za-z0-9]/.test(line[cursor - 1])
        if (!check && skip_self) {
          cursor--
            continue
        }
        skip_self = false
        if (!check) {
          break
        }
        cursor--
    }
    return cursor
  }

  const edit_ctrl_mode = (key: string) => {
    switch (key) {
      case 'o':
        // capture event
        break
      case 'h':
        delete_text_backspace()
        break
      case 'j':
        break_line_and_goto_it()
        break
      case 'v':
        navigator.clipboard.readText().then(_ => {
          let res = _.split('\r\n').join('\n')
          insert_bunch_of_text(res)
        })
        break
      default:
        return false
    }
    return true
  }

  const edit_shift_mode = (key: string) => {
    switch (key) {
        case 'j':
        case 'J':
            join_lines()
            break
        default:
          if (key.length > 1) {
            return false
          }
          if (/[a-zA-Z0-9 \.\=\!\_]/.test(key)) {
            insert_text(key)
            return true
          }
            return false
    }
    return true
  }

  const edit_mode = (key: string, is_ctrl_down: boolean, is_shift_down: boolean) => {
    if (is_ctrl_down) {
      return edit_ctrl_mode(key)
    }
    if (is_shift_down) {
        return edit_shift_mode(key)
    }
    switch (key) {
      case 'Enter':
        break_line_and_goto_it()
        return true
      case 'Backspace':
        delete_text_backspace()
        return true
      case 'Escape':
        set_state('mode', 'normal')
        set_state('motion', null)
        break
        default:
          if (key.length > 1) {
            return false
          }
          if (/[a-zA-Z0-9 \.\=\!\_]/.test(key)) {
            insert_text(key)
            return true
          }
          return false
    }
    set_state('has_unsaved_changes', true)
    return true
  }




    const load_parser = (lines: Line[]) => {

        batch(() => {
            set_parser_state('meta', {})
            set_parser_state('states', {})
            let state = InitParseState
            for (let i = 0; i < lines.length; i++) {
                let [next_state, meta] = LineByLineParser(state, lines[i].content)
                state = next_state
                set_parser_state('states', lines[i].id, state)
                set_parser_state('meta', lines[i].id, meta)
            }
        })
    }

    const set_change_line = (index: number) => {
        updateAndRipple(index)
    }

    function find_column_under_cursor() {
        for (let i = state.i_line; i >= 0; i--) {
            let block = state.lines[i]
            let meta = parser_state.meta[block.id]
            if (!meta) {
              continue
            }
            let i_begin = meta.tokens.findIndex(_ => _.type === TokenType.BeginFact || _.type === TokenType.BeginIdea || _.type === TokenType.BeginLegal)
            if (i_begin !== -1) {
                for (let j = i_begin + 1; j < meta.tokens.length; j++) {
                    if (meta.tokens[j].type === TokenType.Path) {
                        return meta.tokens[j].value
                    }
                }
            }
        }

    }

    function save_program() {
        batch(() => {
            on_save_program_callback(get_full_program())
            set_column_under_cursor()
            set_state('has_unsaved_changes', false)
        })
    }
    function set_column_under_cursor() {
        on_set_column_under_cursor(find_column_under_cursor()??'')
        on_cursor_change()
    }

    const InitParseState: ParseState = {
        in_fact: false,
        in_idea: false,
        in_legal: false,
        line: 0
    }

    function updateAndRipple(index: number) {
        const scanLine = (content: string, state: ParseState) => LineByLineParser(state, content)
        const setLineMetadata = (id: LineId, meta: [ParseState, LineMetadata]) => {
            set_parser_state('states', id, meta[0])
            set_parser_state('meta', id, meta[1])
        }

        let i = index;
        // Look at the line above to get the starting context
        let currentIncomingState = i > 0 && state.lines.length > i - 1
            ? parser_state.states[state.lines[i - 1].id]
            : InitParseState;

        while (i < state.lines.length) {
            const line = state.lines[i];
            const oldMetadata = parser_state.states[line.id];

            // 1. Run your line-parser
            const newMetadata = scanLine(line.content, currentIncomingState);

            // 2. Update the metadata store for this specific ID
            setLineMetadata(line.id, newMetadata);

            // 3. THE STOPPING CONDITION
            // If this wasn't the line we edited, AND the exit state is the same as before...
            // we can stop. The ripple has been absorbed.
            if (i > index && oldMetadata && state_equal(newMetadata[0], oldMetadata)) {
                break;
            }

            currentIncomingState = newMetadata[0]
            i++;
        }
    }

  let res_state = {
    get has_unsaved_changes() {
      return state.has_unsaved_changes
    },
    get camera_y() {
      return state.camera_y
    },
    get meta() {
      return parser_state.meta
    },
    get command() {
      return state.command
    },
    get i_cursor() {
      return state.i_cursor
    },
    get i_line() {
      return state.i_line
    },
    get lines() {
      return state.lines
    },
    get mode() {
      return state.mode
    }
  }

  let on_command_execute_callback: (_: string) => boolean = () => false
  const set_on_command_execute_callback = (fn: (_: string) => boolean) => {
    on_command_execute_callback = fn
  }




  let on_save_program_callback: (_: string) => void = () => { }
  const set_on_save_program_callback = (fn: (_: string) => void) => {
    on_save_program_callback = fn
  }

  let on_set_column_under_cursor: (_: string) => void = () => { }
  const set_on_column_under_cursor_callback = (fn: (_: string) => void) => {
    on_set_column_under_cursor = fn
  }

  let on_cursor_change: () => void = () => { }
  const set_on_cursor_change_callback = (fn: () => void) => {
    on_cursor_change = fn
  }

    return [res_state, {
        scroll_camera_y,
        load_program,
        handle_key_down,
        set_on_save_program_callback,
        set_on_column_under_cursor_callback,
        set_on_cursor_change_callback,
        set_on_command_execute_callback,
    }]
}


function LineByLineParser(incoming_state: ParseState, line: string): [ParseState, LineMetadata] {

    let parse_state = {
        line: incoming_state.line + 1,
        in_fact: incoming_state.in_fact,
        in_idea: incoming_state.in_idea,
        in_legal: incoming_state.in_legal
    }

    let tokens: Token[] = []

    function parse_line() {
        if (incoming_state.in_fact) {
            parse_in_fact()
        } else if (incoming_state.in_idea) {
            parse_in_idea()
        } else if (incoming_state.in_legal) {
            parse_in_legal()
        } else {
            parse_begin_fact_or_idea()
        }
    }

    let line_metadata = {
        line: incoming_state.line + 1,
        tokens
    }

    let chars = line.split('')
    let i = 0
    let next_char = chars[i]

    let begin_char, end_char, value

    parse_line()
    function peek_next_char() {
        return chars[i]
    }

    function get_next_char() {
        if (i >= chars.length) {
            return undefined
        }
        next_char = chars[i++]
        return next_char
    }


    function parse_in_fact() {


        ;[begin_char, end_char, value] = parse_spaces()
        if (begin_char !== end_char) {
            tokens.push({ begin_char, end_char, type: TokenType.Whitespace, value })
        }

        if (peek_next_char() === undefined) {
            tokens.push({ begin_char, end_char, type: TokenType.Newline, value })
            parse_state.in_fact = false
        }
    }

    function parse_in_idea() {


        ;[begin_char, end_char, value] = parse_spaces()
        if (begin_char !== end_char) {
            tokens.push({ begin_char, end_char, type: TokenType.Whitespace, value })
        }

        if (peek_next_char() === undefined) {
            tokens.push({ begin_char, end_char, type: TokenType.Newline, value })
            parse_state.in_idea = false
        }
    }

    function parse_in_legal() {


        ;[begin_char, end_char, value] = parse_spaces()
        if (begin_char !== end_char) {
            tokens.push({ begin_char, end_char, type: TokenType.Whitespace, value })
        }

        if (peek_next_char() === undefined) {
            tokens.push({ begin_char, end_char, type: TokenType.Newline, value })
            parse_state.in_legal = false
        }
    }

    function parse_begin_fact_or_idea() {
        
        ;[begin_char, end_char, value] = parse_spaces()
        if (begin_char !== end_char) {
            tokens.push({ begin_char, end_char, type: TokenType.Whitespace, value })
        }

        ;[begin_char, end_char, value] = parse_word()
        if (begin_char !== end_char) {
            if (value === 'fact') {
                tokens.push({ begin_char, end_char, type: TokenType.BeginFact, value })
                parse_state.in_fact = true
            } else if (value === 'idea') {
                tokens.push({ begin_char, end_char, type: TokenType.BeginIdea, value })
                parse_state.in_idea = true
            } else if (value === 'legal') {
                tokens.push({ begin_char, end_char, type: TokenType.BeginLegal, value })
                parse_state.in_legal = true
            } else {
                tokens.push({ begin_char, end_char, type: TokenType.Path, value })
            }
        }


        ;[begin_char, end_char, value] = parse_spaces()
        if (begin_char !== end_char) {
            tokens.push({ begin_char, end_char, type: TokenType.Whitespace, value })
        }


        ;[begin_char, end_char, value] = parse_word()
        if (begin_char !== end_char) {
            if (value === 'fact') {
                tokens.push({ begin_char, end_char, type: TokenType.BeginFact, value })
                parse_state.in_fact = true
            } else if (value === 'idea') {
                tokens.push({ begin_char, end_char, type: TokenType.BeginIdea, value })
                parse_state.in_idea = true
            } else if (value === 'legal') {
                tokens.push({ begin_char, end_char, type: TokenType.BeginLegal, value })
                parse_state.in_legal = true
            } else {
                tokens.push({ begin_char, end_char, type: TokenType.Path, value })
            }
        }


    }

    type ParseResult = [number, number, string]

    function parse_spaces(): ParseResult {
        let begin_char = i
        let res = ''
        while (peek_next_char() !== undefined && / /.test(peek_next_char())) {
            res += get_next_char()
        }
        let end_char = i
        return [begin_char, end_char, res]
    }

    function parse_word(): ParseResult {
        let res = ''
        let begin_char = i
        while (peek_next_char() !== undefined && is_alpha_num(peek_next_char())) {
            res += get_next_char()
        }
        let end_char = i
        return [begin_char, end_char, res]
    }

    function is_alpha_num(char: string) {
        return /[A-Za-z0-9_]/.test(char)
    }
    



    return [parse_state, line_metadata]
}