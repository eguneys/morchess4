import { createStore } from 'solid-js/store'
import type { Puzzle } from './fixture'
import Worker from './worker_job?worker'
import { createContext, createSignal, type JSX, useContext } from 'solid-js'
import { createAsync } from '@solidjs/router'
import type { PuzzleResult } from './worker_job'

type WorkerState = {
    progress: string | undefined
    list: Puzzle[] | undefined
    run_on_list: PuzzleResult[] | undefined
    run_on_one: PuzzleResult | undefined
}

type WorkerActions = {
    one(id: string, program: string): void
    batch(program: string): void
}

type WorkerStore = [WorkerState, WorkerActions]

const WorkerContext = createContext<WorkerStore>()
export const useWorker = () => useContext(WorkerContext)!


export const WorkerProvider = (props: { children: JSX.Element }) => {
    let worker = new Worker()
    worker.onmessage = (e) => {
        if (e.data === 'ready') {
            set_state('ready', true)
            worker.postMessage({ t: 'list' })
        }
        if (e.data.t === 'progress') {
            set_state('progress', e.data.d)
        }
        if (e.data.t === 'list') {
            worker_resolve_list(e.data.d)
        }
        if (e.data.t === 'run_on_skips') {
            worker_resolve_run_on_list(e.data.d)
        }
        if (e.data.t === 'run_on_one') {
            worker_resolve_run_on_one(e.data.d)
        }
    }



    let [state, set_state] = createStore({
        ready: false,
        progress: undefined,
    })

    type PuzzleId = string
    type Program = string

    let worker_resolve_list: (_: Puzzle[]) => void 
    let fetch_list = createAsync(() => {
        return new Promise<Puzzle[]>(resolve => worker_resolve_list = resolve)
    })




    let worker_resolve_run_on_one: (_: PuzzleResult) => void 
    let [_run_on_one, set_fetch_run_on_one] = createSignal<{id: PuzzleId, program: Program} | undefined>(undefined)
    let fetch_run_on_one = createAsync(() => {
        let res = _run_on_one()
        if (res) {
            worker.postMessage({ t: 'one', d: res })
        }
        return new Promise<PuzzleResult>(resolve => worker_resolve_run_on_one = resolve)
    })


    let worker_resolve_run_on_list: (_: PuzzleResult[]) => void 
    let [_run_on_list, set_fetch_run_on_list] = createSignal<{program: Program} | undefined>(undefined)
    let fetch_run_on_list = createAsync(() => {
        let res = _run_on_list()
        if (res) {
            worker.postMessage({ t: 'batch', d: res })
        }
        return new Promise<PuzzleResult[]>(resolve => worker_resolve_run_on_list = resolve)
    })



    let actions = {
        one(id: PuzzleId, program: Program) {
            set_fetch_run_on_one({ id, program })
        },
        batch(program: Program) {
            set_fetch_run_on_list({ program })
        }
    }



    let getters = {
        get progress() {
            return state.progress
        },
        get list() {
            return fetch_list()
        },
        get run_on_list() {
            return fetch_run_on_list()
        },
        get run_on_one() {
            return fetch_run_on_one()
        }
    }

    return (<>
        <WorkerContext.Provider value={[getters, actions]}>
            {props.children}
        </WorkerContext.Provider>
    </>)
}
