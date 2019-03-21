/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Protocol as CDTP } from 'devtools-protocol';
import * as sourceMapUtils from '../../../sourceMaps/sourceMapUtils';
import { inject, injectable, multiInject } from 'inversify';
import { ChromeDebugLogic } from '../../chromeDebugAdapter';
import { TYPES } from '../../dependencyInjection.ts/types';
import { ICommandHandlerDeclarer, CommandHandlerDeclaration, IServiceComponent } from '../../internal/features/components';
import { BaseCDAState } from './baseCDAState';
import { IDomainsEnabler } from '../../cdtpDebuggee/infrastructure/cdtpDomainsEnabler';
import { IRuntimeStarter } from '../../cdtpDebuggee/features/cdtpRuntimeStarter';
import { InitializedEvent, logger, TerminatedEvent } from 'vscode-debugadapter';
import { ISession } from '../session';
import { telemetry } from '../../../telemetry';
import { ChromeConnection } from '../../chromeConnection';
import { IRestartRequestArgs, ILaunchRequestArgs } from '../../../debugAdapterInterfaces';
import { ConnectedCDAConfiguration } from './cdaConfiguration';
import { ChromeDebugAdapter } from './chromeDebugAdapterV2';
import { TerminatingCDAProvider, TerminatingReason } from './terminatingCDA';

export type ConnectedCDAProvider = (protocolApi: CDTP.ProtocolApi) => ConnectedCDA;

@injectable()
export class ConnectedCDA extends BaseCDAState {
    public static SCRIPTS_COMMAND = '.scripts';
    private _ignoreNextDisconnectedFromWebSocket = false;

    constructor(
        @inject(TYPES.ChromeDebugLogic) private readonly _chromeDebugAdapterLogic: ChromeDebugLogic,
        @inject(TYPES.IDomainsEnabler) private readonly _domainsEnabler: IDomainsEnabler,
        @inject(TYPES.IRuntimeStarter) private readonly _runtimeStarter: IRuntimeStarter,
        @inject(TYPES.ISession) private readonly _session: ISession,
        @inject(TYPES.ConnectedCDAConfiguration) private readonly _configuration: ConnectedCDAConfiguration,
        @inject(TYPES.ChromeConnection) private readonly _chromeConnection: ChromeConnection,
        @inject(TYPES.TerminatingCDAProvider) private readonly _terminatingCDAProvider: TerminatingCDAProvider,
        @inject(TYPES.ChromeDebugAdapter) private readonly _chromeDebugAdapter: ChromeDebugAdapter,
        @multiInject(TYPES.IServiceComponent) private readonly _serviceComponents: IServiceComponent[],
        @multiInject(TYPES.ICommandHandlerDeclarer) requestHandlerDeclarers: ICommandHandlerDeclarer[]
    ) {
        super(requestHandlerDeclarers, {
            'initialize': () => { throw new Error('The debug adapter is already initialized. Calling initialize again is not supported.'); },
            'launch': () => { throw new Error("Can't launch  to a new target while connected to a previous target"); },
            'attach': () => { throw new Error("Can't attach to a new target while connected to a previous target"); },
            'disconnect': async () => {
                this._ignoreNextDisconnectedFromWebSocket = true;
                await this.disconnect(TerminatingReason.DisconnectedFromWebsocket);
            },
        });
    }

    public async install(): Promise<this> {
        await super.install();
        await this._chromeDebugAdapterLogic.install();
        await this._domainsEnabler.enableDomains(); // Enables all the domains that were registered

        for (const serviceComponent of this._serviceComponents) {
            await serviceComponent.install();
        }

        await this._runtimeStarter.runIfWaitingForDebugger();
        this._session.sendEvent(new InitializedEvent());

        this._chromeConnection.onClose(() => {
            if (!this._ignoreNextDisconnectedFromWebSocket) {
                // When the client requests a disconnect, we kill Chrome, which will in turn disconnect the websocket, so we'll also get this event.
                // To avoid processing the same disconnect twice, we ignore the first disconnect from websocket after the client requests a disconnect
                this.disconnect(TerminatingReason.DisconnectedFromWebsocket);
                this._ignoreNextDisconnectedFromWebSocket = false;
            }
        });
        return this;
    }

    public async disconnect(reason: TerminatingReason): Promise<void> {
        const terminatingCDA = this._terminatingCDAProvider(reason);
        await terminatingCDA.install();
        this._chromeDebugAdapter.disconnect(terminatingCDA);
    }
}