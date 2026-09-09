/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

/**
 * This class tracks a path into a structure
 * This allows reverse-traversal, reversing course and choosing another line of action
 */
export default class jobjesPathTracker {
    #path; // paths are linier, and do not support forking (they don't need to)
    #cursor; // this is the index in the path array

    /**
     * Create a path tracker instance
     * @param {any[] | object | undefined} [soFar=undefined] the root object (or array) or undefined to start empty
     */
    constructor(soFar = undefined) {
        if (!!soFar) {
            this.#path = [soFar];
        } else {
            this.#path = [];
        }

        this.#cursor = 0;
    }

    /**
     * The length of the path
     * @returns {number} The number of items in the path
     */
    length() {
        return this.#path.length;
    }

    /**
     * Sets the path tracker's content to the given array, completely overwriting anything currently tracked
     * @param {any[]} content An array containing anything that is to be tracked.  If a non-array is provided, nothing happens
     * @returns The jobjesPathTracker instance
     */
    load(content = []) {
        if (Array.isArray(content)) {
            this.#path = [...content];
        }

        return this;
    }

    /**
     * @returns A clone of the current jobjesPathTracker instance
     */
    dupe() {
        let res = new jobjesPathTracker();
        res.load(this.#path);
        return res;
    }

    /**
     * Moves the current cursor index by the given value (does not overstep bounds)
     * @param {number} offset The positive or negative offset from the current index
     * @returns The jobjesPathTracker instance
     */
    setRel(offset = 0) {
        if (offset > 0) {
            if ((this.#cursor + offset) < this.#path.length) {
                this.#cursor += offset;
            } else {
                this.#cursor = this.#path.length - 1;
            }
        } else if (offset < 0) {
            if ((this.#cursor + offset) >= 0) {
                this.#cursor += offset;
            } else {
                this.#cursor = 0;
            }
        }

        return this;
    }

    /**
     * Sets the cursor to an absolute index (does not overstep bounds)
     * @param {number} absolute The absolute index to set the cursor to
     * @returns The jobjesPathTracker instance
     */
    setAbs(absolute = 0) {
        if (this.#path.length > absolute && absolute >= 0) {
            this.#cursor = absolute;
        }

        return this;
    }

    /**
     * Returns the current cursor index
     */
    index() {
        return this.#cursor;
    }

    /**
     * Moves the cursor to the end of the path
     * @returns the jobjesPathTracker instance
     */
    end() {
        this.#cursor = this.#path.length - 1;
        return this;
    }

    /**
     * Adds an item at the current cursor.  Deletes everything after the addition, if the cursor is not at the end
     * @param {any} obj The item to add / insert
     * @returns the jobjesPathTracker instance
     */
    step(obj) {
        if (this.#cursor < (this.#path.length - 1)) {
            this.#path = this.#path.slice(0, this.#cursor);
        }

        this.#path.push(obj);
        this.#cursor = this.#path.length - 1;

        return this;
    }

    /**
     * @returns The item at the current cursor location
     */
    at() {
        return this.#path[this.#cursor];
    }

    /**
     * Gets the item at the given point relative to the current cursor position (does not overstep bounds)
     * @param {number} offset The offset from the current cursor position
     * @returns The object at the given location
     */
    getRel(offset = 0) {
        let relativeIndex = 0;

        if (offset > 0) {
            if ((this.#cursor + offset) < this.#path.length) {
                relativeIndex = this.#cursor + offset;
            } else {
                relativeIndex = this.#path.length - 1;
            }
        } else if (offset < 0) {
            if ((this.#cursor + offset) >= 0) {
                relativeIndex = this.#cursor + offset;
            } else {
                relativeIndex = 0;
            }
        }

        return this.#path[relativeIndex];
    }

    /**
     * Gets the item at the give absolute cursor value (does not overstep bounds)
     * @param {number} absolute The absolute index to set the cursor to
     * @returns The jobjesPathTracker instance
     */
    getAbs(absolute = 0) {
        if (this.#path.length > absolute && absolute >= 0) {
            return this.#path[absolute];
        }

        return undefined;
    }

    /**
     * Deletes everything in the path after the current cursor
     * @returns the jobjesPathTracker
     */
    clip() {
        this.#path = this.#path.slice(0, this.#cursor);
        return this;
    }

    /**
     * Terminates the path at the given absolute index (leaves the cursor at the end)
     * @param {number} absolute The absolute index to end the path at
     * @returns the jobjesPathTracker instance
     */
    sheer(absolute = 0) {
        const location = this.#cursor;

        this.setAbs(absolute);
        this.clip();

        this.end();
        return this;
    }

    /**
     * Compares two path trackers and returns true or false indicating if they hold identical routes
     * @param {jobjesPathTracker} tracker The tracker to compare
     * @returns {boolean} a value indicating if they are equal
     */
    equality(tracker) {
        // if they are equal, the individual indexes of components will be identical.  Any divergence means they are not equal.

        let outcome = this.#path.length === tracker.#path.length;
        if (outcome === true) {
            for (let index = 0; index < this.#path.length; index++) {
                const match = this.#path[index] === tracker.#path[index];

                if (match !== true) {
                    outcome = false;
                    break;
                }
            }
        }

        return outcome;
    }

    /**
     * Compares two trackers and returns the index where they diverge.  -1 if they match.
     * @param {jobjesPathTracker} tracker The tracker to compare
     * @returns {number} The index where divergence occurs.  -1 if none.
     */
    divergence(tracker) {
        let index = 0;
        let diversion = -1;

        while (true) {
            const match = this.#path[index] === tracker.#path[index];

            if (match !== true) {
                diversion = index;
                break;
            }

            index++;
            if (index >= this.#path.length && index < tracker.#path.length) {
                diversion = index;
                break;
            } else if (index < this.#path.length || index >= tracker.#path.length) {
                diversion = index;
                break;
            }

            if (index >= this.#path.length && index >= tracker.#path.length) {
                break;
            }
        }

        return diversion;
    }

    /**
     * Checks to see if the given item is in the track
     * @param {any} item Returns true if the given item exists within the path tracker
     * @returns {boolean} Returns true if the item is in the tracker
     */
    has(item) {
        return this.hasAt(item) >= 0;
    }

    /**
     * Checks to see if the given item is in the track
     * @param {any} item Returns true if the given item exists within the path tracker
     * @returns {boolean} Returns the index of the item, if found or -1
     */
    hasAt(item) {
        let at = -1;
        for (let i = 0; i < this.#path.length; i++) {
            if (this.#path[i] === item) {
                at = i;
                break;
            }
        }

        return at;
    }

    /**
     * Returns true if the last element in the path is the given item
     * @param {any} item The item to check for
     * @returns {boolean} True if the item provided is the last item in the path
     */
    endsWith(item) {
        return this.#path[this.#path.length - 1] === item;
    }
}