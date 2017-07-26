/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

import {BasePathTransformer} from './basePathTransformer';

import {logger} from 'vscode-debugadapter';
import * as utils from '../utils';
import * as errors from '../errors';
import {ISetBreakpointsArgs, ICommonRequestArgs, IAttachRequestArgs, ILaunchRequestArgs, IStackTraceResponseBody} from '../debugAdapterInterfaces';

/**
 * Converts a local path from Code to a path on the target.
 */
export class RemotePathTransformer extends BasePathTransformer {
    private _localRoot: string;
    private _remoteRoot: string;

    public launch(args: ILaunchRequestArgs): Promise<void> {
        return this.init(args);
    }

    public attach(args: IAttachRequestArgs): Promise<void> {
        return this.init(args);
    }

    private init(args: ICommonRequestArgs): Promise<void> {
        // Maybe validate that it's absolute, for either windows or unix
        this._remoteRoot = args.remoteRoot;

        // Validate that localRoot is absolute and exists
        let localRootP = Promise.resolve();
        if (args.localRoot) {
            const localRoot = args.localRoot;
            if (!path.isAbsolute(localRoot)) {
                return Promise.reject(errors.attributePathRelative('localRoot', localRoot));
            }

            localRootP = new Promise<void>((resolve, reject) => {
                fs.exists(localRoot, exists => {
                    if (!exists) {
                        reject(errors.attributePathNotExist('localRoot', localRoot));
                    }

                    this._localRoot = localRoot;
                    resolve();
                });
            });
        }

        return localRootP;
    }

    public setBreakpoints(args: ISetBreakpointsArgs): void {
        if (args.source.path) {
            args.source.path = this.getTargetPathFromClientPath(args.source.path);
        }

        return super.setBreakpoints(args);
    }

    public scriptParsed(scriptPath: string): string {
        scriptPath = this.getClientPathFromTargetPath(scriptPath);
        return super.scriptParsed(scriptPath);
    }

    public stackTraceResponse(response: IStackTraceResponseBody): void {
        response.stackFrames.forEach(frame => {
            const remotePath = frame.source && frame.source.path;
            if (remotePath) {
                const localPath = this.getClientPathFromTargetPath(remotePath);
                if (utils.existsSync(localPath)) {
                    frame.source.path = localPath;
                    frame.source.sourceReference = undefined;
                    frame.source.origin = undefined;
                }
            }
        });
    }

    private shouldMapPaths(remotePath: string): boolean {
        // Map paths only if localRoot/remoteRoot are set, and the remote path is absolute on some system
        return !!this._localRoot && !!this._remoteRoot && (path.posix.isAbsolute(remotePath) || path.win32.isAbsolute(remotePath));
    }

    public getClientPathFromTargetPath(remotePath: string): string {
        if (!this.shouldMapPaths(remotePath)) return remotePath;

        const relPath = relative(this._remoteRoot, remotePath);
        let localPath = join(this._localRoot, relPath);

        localPath = utils.fixDriveLetterAndSlashes(localPath);
        logger.log(`Mapped remoteToLocal: ${remotePath} -> ${localPath}`);
        return localPath;
    }

    public getTargetPathFromClientPath(localPath: string): string {
        if (!this.shouldMapPaths(localPath)) return localPath;

        const relPath = relative(this._localRoot, localPath);
        let remotePath = join(this._remoteRoot, relPath);

        remotePath = utils.fixDriveLetterAndSlashes(remotePath, /*uppercaseDriveLetter=*/true);
        logger.log(`Mapped localToRemote: ${localPath} -> ${remotePath}`);
        return remotePath;
    }
}

/**
 * Cross-platform path.relative
 */
function relative(a: string, b: string): string {
    return a.match(/^[A-Za-z]:/) ?
        path.win32.relative(a, b) :
        path.posix.relative(a, b);
}

/**
 * Cross-platform path.join
 */
function join(a: string, b: string): string {
    return a.match(/^[A-Za-z]:/) ?
        path.win32.join(a, b) :
        utils.forceForwardSlashes(path.posix.join(a, b));
}
