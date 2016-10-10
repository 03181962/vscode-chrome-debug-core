/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as DebugProtocol from 'vscode-debugadapter';

import {ChromeDebugAdapter} from './chromeDebugAdapter';
import Crdp from '../../crdp/crdp';

export interface IVariableContainer {
    objectId: string;
    expand(adapter: ChromeDebugAdapter, filter?: string, start?: number, count?: number): Promise<DebugProtocol.Variable[]>;
    setValue(adapter: ChromeDebugAdapter, name: string, value: string): Promise<string>;
}

export abstract class BaseVariableContainer implements IVariableContainer {
    constructor(public objectId: string) {
    }

    public expand(adapter: ChromeDebugAdapter, filter?: string, start?: number, count?: number): Promise<DebugProtocol.Variable[]> {
        return adapter.getVariablesForObjectId(this.objectId, filter, start, count);
    }

    public abstract setValue(adapter: ChromeDebugAdapter, name: string, value: string): Promise<string>;
}

export class PropertyContainer extends BaseVariableContainer {
    public setValue(adapter: ChromeDebugAdapter, name: string, value: string): Promise<string> {
        return adapter.setPropertyValue(this.objectId, name, value);
    }
}

export class ScopeContainer extends BaseVariableContainer {
    private _thisObj: Crdp.Runtime.RemoteObject;
    private _returnValue: Crdp.Runtime.RemoteObject;
    private _frameId: string;
    private _origScopeIndex: number;

    public constructor(frameId: string, origScopeIndex: number, objectId: string, thisObj?: Crdp.Runtime.RemoteObject, returnValue?: Crdp.Runtime.RemoteObject) {
        super(objectId);
        this._thisObj = thisObj;
        this._returnValue = returnValue;
        this._frameId = frameId;
        this._origScopeIndex = origScopeIndex;
    }

    /**
     * Call super then insert the 'this' object if needed
     */
    public expand(adapter: ChromeDebugAdapter, filter?: string, start?: number, count?: number): Promise<DebugProtocol.Variable[]> {
        // No filtering in scopes right now
        return super.expand(adapter, 'all', start, count).then(variables => {
            if (this._thisObj) {
                // If this is a scope that should have the 'this', prop, insert it at the top of the list
                return this.insertRemoteObject(adapter, variables, 'this', this._thisObj);
            }

            return variables;

        }).then(variables => {
            if (this._returnValue) {
                return this.insertRemoteObject(adapter, variables, 'Return value', this._returnValue);
            }

            return variables;
        });
    }

    public setValue(adapter: ChromeDebugAdapter, name: string, value: string): Promise<string> {
        return adapter.setVariableValue(this._frameId, this._origScopeIndex, name, value);
    }

    private insertRemoteObject(adapter: ChromeDebugAdapter, variables: DebugProtocol.Variable[], name: string, obj: Crdp.Runtime.RemoteObject): Promise<DebugProtocol.Variable[]> {
        return adapter.remoteObjectToVariable(name, obj).then(variable => {
            variables.unshift(variable);
            return variables;
        });
    }
}

export class ExceptionContainer extends PropertyContainer {
    protected _exception: Crdp.Runtime.RemoteObject;

    protected constructor(objectId: string, exception: Crdp.Runtime.RemoteObject) {
        super(exception.objectId);
        this._exception = exception;
    }

    /**
     * Expand the exception as if it were a Scope
     */
    public static create(exception: Crdp.Runtime.RemoteObject): ExceptionContainer {
        return exception.objectId ?
            new ExceptionContainer(exception.objectId, exception) :
            new ExceptionValueContainer(exception);
    }
}

/**
 * For when a value is thrown instead of an object
 */
export class ExceptionValueContainer extends ExceptionContainer {
    public constructor(exception: Crdp.Runtime.RemoteObject) {
        super('EXCEPTION_ID', exception);
    }

    /**
     * Make up a fake 'Exception' property to hold the thrown value, displayed under the Exception Scope
     */
    public expand(adapter: ChromeDebugAdapter, filter?: string, start?: number, count?: number): Promise<DebugProtocol.Variable[]> {
        const excValuePropDescriptor: Crdp.Runtime.PropertyDescriptor = <any>{ name: 'Exception', value: this._exception };
        return adapter.propertyDescriptorToVariable(excValuePropDescriptor)
            .then(variable => [variable]);
    }
}

export function isIndexedPropName(name: string): boolean {
    return !isNaN(parseInt(name, 10));
}
