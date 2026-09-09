/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

export const LogNatures = {
    Informative: "Informative",
    Error: "Error",
}

/**
 * Provides a simple logging solution for universal use throughout the jobjes system
 */
export class jobjesLog {
    #log;

    /**
     * Create a log instance
     * @param {Array} [logStorage=[]] If provided, will use the given array for log entry storage
     */
    constructor(logStorage = []) {
        this.#log = logStorage;
    }

    /**
     * Empties the log
     * @param {Array} newStorageArray If provided, will use the given array for log entry storage going forward
     * @returns The old log
     */
    reset(newStorageArray) {
        const old = this.#log;
        this.#log = !!newStorageArray ? newStorageArray : this.#log;

        return old;
    }

    /**
     * Filters the entries and returns the results
     * Logs should have some (but not necessarily all of) the following properties:
     *      nature: see LogNatures object
     *      date: when the entry was made (note that this field is a number)
     *      reason: why the entry was made (the error message)
     *      error: the exception that triggered the entry
     *      location: the character index from the start of the line where the entry was triggered
     * @param {function} filterFunc A filter function for use with Array.filter
     */
    filter(filterFunc) {
        return this.#log.filter(filterFunc);
    }

    /**
     * Returns all of the entries in a copy of the log array
     * @returns Returns a copy of the log array, not the actual array
     */
    all() {
        return [...this.#log];
    }

    /**
     * Returns the actual log array instance
     * @returns Returns the actual log array
     */
    actual() {
        return this.#log;
    }

    /**
     * Returns the number of entries in the log
     * @returns The number of entries in the log
     */
    count() {
        return this.#log.length;
    }

    /**
     * Adds an error log entry
     * @param {string} reason The log message
     * @param {object} error The exception
     * @param {object | Number} location Either a coordinate set, or the distance from line start
     * @param {object} furtherInfo If provided, will be merged into the resulting entry
     */
    logError(reason, error, location, furtherInfo) {
        const entry = !!furtherInfo ?
            {
                "nature": LogNatures.Error,
                "date": Date.now(),
                "reason": reason,
                "error": error,
                "location": location,
                ...furtherInfo
            } : {
                "nature": LogNatures.Error,
                "date": Date.now(),
                "reason": reason,
                "error": error,
                "location": location
            }

        this.#log.push(entry);
    }

    /**
     * Adds an informative log entry
     * @param {string} message The log message
     * @param {object | Number} location Either a coordinate set, or the distance from line start
     * @param {object} furtherInfo If provided, will be merged into the resulting entry
     */
    logInfo(message, location, furtherInfo) {
        const entry = !!furtherInfo ?
            {
                "nature": LogNatures.Informative,
                "date": Date.now(),
                "reason": message,
                "location": location,
                ...furtherInfo
            } : {
                "nature": LogNatures.Informative,
                "date": Date.now(),
                "reason": message,
                "location": location
            }

        this.#log.push(entry);
    }
}