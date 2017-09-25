/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {DebugProtocol} from 'vscode-debugprotocol';

import {ISetBreakpointsArgs, ILaunchRequestArgs, IAttachRequestArgs, IStackTraceResponseBody} from '../debugAdapterInterfaces';

/**
 * Converts a local path from Code to a path on the target.
 */
export class BasePathTransformer {
    public launch(args: ILaunchRequestArgs): Promise<void> {
        return Promise.resolve();
    }

    public attach(args: IAttachRequestArgs): Promise<void> {
        return Promise.resolve();
    }

    public setBreakpoints(args: ISetBreakpointsArgs): void {
    }

    public clearTargetContext(): void {
    }

    public scriptParsed(scriptPath: string): string {
        return scriptPath;
    }

    public breakpointResolved(bp: DebugProtocol.Breakpoint, targetPath: string): string {
        return this.getClientPathFromTargetPath(targetPath) || targetPath;
    }

    public stackTraceResponse(response: IStackTraceResponseBody): void {
    }

    public fixStackFrame(stackFrame: DebugProtocol.StackFrame): void {
    }

    public getTargetPathFromClientPath(clientPath: string): string {
        return clientPath;
    }

    public getClientPathFromTargetPath(targetPath: string): string {
        return targetPath;
    }
}
