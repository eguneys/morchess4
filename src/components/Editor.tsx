import { makePersisted } from "@solid-primitives/storage"
import { batch, createContext, createMemo, For, onMount, Show, useContext, type JSX } from "solid-js"
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

type Motion = 'delete' | null

type EditorState = {
  camera_y: number
  motion: Motion
  mode: Mode
  command: string
  i_line: number
  i_cursor: number
  lines: Line[]
}

type EditorProps = { 
    on_set_column_under_cursor: (_: string) => void, 
    on_save_program: (_: string) => void 
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
        scroll_camera_y
    }] = useEditor()

  onMount(() => {
    load_program()
    focus_on_editor()
    set_on_save_program_callback(props.on_save_program)
    set_on_column_under_cursor_callback(props.on_set_column_under_cursor)


    bounds = $el.getBoundingClientRect()
    set_on_cursor_change_callback(on_cursor_change)

  })

  const on_cursor_change = () => {
    let $cursor = $el.querySelector('.cursor')
    if (!$cursor || !bounds) {
        return
    }

    let rect = $cursor.getBoundingClientRect()

    if (bounds.bottom - rect.bottom < 130) {
        scroll_camera_y(1)
    } 
    if (rect.top - bounds.top < 130) {
        scroll_camera_y(-1)
    }
  }

  let bounds: DOMRect

  let $el!: HTMLDivElement
  let focus_on_editor = () => $el.focus()

  return (<>
  <div ref={$el} tabIndex={1} class='flex flex-col space-mono-regular editor bg-slate-800 w-full h-full text-white cursor-text' onMouseDown={() => focus_on_editor} onKeyDown={handle_key_down}>
    <div class='flex flex-col overflow-hidden w-100'>
    <For each={state.lines}>{ (block, i) => 
        <Show when={i() >= state.camera_y}>
            <Block mode={state.mode} block={block} cursor={i() === state.i_line ? state.i_cursor : undefined} />
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

function Block(props: { block: Line, cursor?: number, mode: Mode }) {

  const [editor] = useEditor()
  let chars = createMemo(() => props.block.content.split(''))
  const meta = createMemo(() => editor.meta[props.block.id])

  const in_token = (i: number) => meta()?.tokens.find(_ => _.begin_char <= i && i < _.end_char)
  return (<>
    <div class='whitespace-pre'>
      <For each={chars()}>{(char, i) =>
        <Char in_token={in_token(i())} char={char} cursor={i() === props.cursor ? { mode: props.mode } : undefined}></Char>
      }</For>

        <Char char={' '} cursor={chars().length === props.cursor ? { mode: props.mode } : undefined}></Char>
    </div>
  </>)
}

function Char(props: { in_token?: Token, char: string, cursor?: Cursor }) {
    const highlight = createMemo(() => props.in_token?.type === TokenType.BeginFact ? 'text-emerald-500' : 'text-gray-200')
  return (<><span class='relative'>
    <Show when={props.cursor}>{cursor =>
      <Cursor cursor={cursor()} char={props.char} />
    }</Show>
    <span class={`relative ${highlight()}`}>{props.char}</span>
  </span></>)
}

type Cursor = {
  mode: Mode
}
function Cursor(props: { cursor: Cursor, char: string }) {
  return <span class={`cursor animate-[pulse.8s_linear_infinite] left-0 absolute h-full ${props.cursor.mode === 'normal' ? 'w-full bg-amber-800' : 'w-0.5 bg-emerald-500'}`}></span>
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
    camera_y: number,
    meta: Record<LineId, LineMetadata>
    command: string,
    i_cursor: number,
    i_line: number,
    lines: Line[],
    mode: Mode
}

type EditorStoreActions = {
    load_program(): void
    handle_key_down: (e: KeyboardEvent) => void
    set_on_save_program_callback: (fn: (_: string) => void) => void
    set_on_column_under_cursor_callback: (fn: (_: string) => void) => void
    set_on_cursor_change_callback: (fn: () => void) => void
    scroll_camera_y: (_: number) => void
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
    camera_y: 0,
    motion: null,
    command: '',
    mode: 'normal',
    i_line: 0,
    i_cursor: 0,
    lines: [first_line]
  })

  const scroll_camera_y = (delta: number) => {
    set_state('camera_y', Math.min(Math.max(0, state.camera_y + delta), state.lines.length))
  }

  const clamp_cursor_to_line = () => {
    if (state.i_line < 0) {
      set_state('i_line', 0)
    }
    if (state.i_line >= state.lines.length) {
      set_state('i_line', state.lines.length - 1)
    }
    if (state.i_cursor > state.lines[state.i_line].content.length) {
      set_state('i_cursor', state.lines[state.i_line].content.length - 1)
    }
    if (state.i_cursor < 0) {
      set_state('i_cursor', 0)
    }
    set_column_under_cursor()
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

  const enter_newline_and_goto_it = () => {
    batch(() => {
      set_state('lines', lines =>
        lines.toSpliced(state.i_line + 1, 0, line(''))
      )
      set_state('i_line', state.i_line + 1)
      set_state('i_cursor', 0)
    })
  }

  const enter_newline_and_stay = () => {
    batch(() => {
      set_state('lines', lines =>
        lines.toSpliced(state.i_line, 0, line(''))
      )
      //set_state('i_line', state.i_line)
      //set_state('i_cursor', 0)
      clamp_cursor_to_line()
    })
  }



  const insert_text = (key: string) => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor) + key + content.slice(state.i_cursor)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor + 1)

      set_change_line(state.i_line)
    })
  }

  const handle_key_down = (e: KeyboardEvent) => {
    let handled = false
    if (state.mode === 'command') {
      handled = command_mode(e.key)
    } else if (state.mode === 'edit') {
      handled = edit_mode(e.key, e.ctrlKey, e.shiftKey)
    } else if (state.mode === 'normal') {
      handled = normal_mode(e.key, e.shiftKey)
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
        return false
    }
    return true
  }

  const [persisted_program, set_persisted_program] = makePersisted(createStore({
    program: 'hello',
    i_cursor: 0,
    i_line: 0,
  }), {
    name: '.morchess4.program'
  })

  const load_program = () => {
    let lines = persisted_program.program.split('\n').map(content => line(content))

    batch(() => {
      set_state('lines', lines)
      set_state('i_line', persisted_program.i_line)
      set_state('i_cursor', persisted_program.i_cursor)

      load_parser(state.lines)
    })
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
        save_program()
      })
    }
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

  const normal_mode = (key: string, is_shift_down: boolean) => {
    switch (key) {
      case ':':
        set_state('mode', 'command')
        break
      case 'c':
      case 'C':
        if (is_shift_down) {
          delete_rest_of_the_line_and_enter_insert()
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
            set_state('i_cursor', get_cursor_next_word_beginning(state.i_cursor))
            clamp_cursor_to_line()
        })
        break
     case 'b':
        batch(() => {
            set_state('i_cursor', get_cursor_previous_word_beginning(state.i_cursor))
            clamp_cursor_to_line()
        })
        break
        case '0':
            set_state('i_cursor', 0)
            break
        case '$':
            batch(() => {
                set_state('i_cursor', 999)
                clamp_cursor_to_line()
            })
            break
        default:
          return false
    }
    return true
  }

  const get_cursor_next_word_beginning = (cursor: number) => {
    let line = state.lines[state.i_line].content
    let has
    while (cursor < line.length) {
        let check = /[A-Za-z0-9]/.test(line[cursor])
        if (has === undefined) {
            has = check
            continue
        }
        if (has !== check) {
            break
        }
        cursor++
    }
    return cursor
  }

  const get_cursor_previous_word_beginning = (cursor: number) => {
    let line = state.lines[state.i_line].content
    let has
    while (cursor > 0) {
        let check = /[A-Za-z0-9]/.test(line[cursor])
        if (has === undefined) {
            has = check
            continue
        }
        if (has !== check) {
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
        let currentIncomingState = i > 0
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

    let on_save_program_callback: (_: string) => void = () => {}
    const set_on_save_program_callback = (fn: (_: string) => void) => {
        on_save_program_callback = fn
    }

    let on_set_column_under_cursor: (_: string) => void = () => {}
    const set_on_column_under_cursor_callback = (fn: (_: string) => void) => {
        on_set_column_under_cursor = fn
    }

    let on_cursor_change: () => void = () => {}
    const set_on_cursor_change_callback = (fn: () => void) => {
        on_cursor_change = fn
    }

    return [res_state, {
        scroll_camera_y,
        load_program,
        handle_key_down,
        set_on_save_program_callback,
        set_on_column_under_cursor_callback,
        set_on_cursor_change_callback
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