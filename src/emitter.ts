import { EventEmitter as eventEmitter } from "node:events";

type EventFunctionMap = Record<string, (...args: any[]) => any>;

export class EventEmitter<T extends EventFunctionMap> {
	private readonly emitter = new eventEmitter();

	emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
		return this.emitter.emit(event as string, ...args);
	}

	on<K extends keyof T>(event: K, listener: T[K]): this {
		this.emitter.on(event as string, listener);
		return this;
	}

	once<K extends keyof T>(event: K, listener: T[K]): this {
		this.emitter.once(event as string, listener);
		return this;
	}

	off<K extends keyof T>(event: K, listener: T[K]): this {
		this.emitter.off(event as string, listener);
		return this;
	}

	removeAllListeners<K extends keyof T>(event?: K): this {
		this.emitter.removeAllListeners(event as string);
		return this;
	}
}
