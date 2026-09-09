import jobjesPathTracker from "./jobjesPathTracker.mjs";

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

/**
 * This class' purpose is to use multiple jobjesPathTrackers to track individual routes through an object hierarchy
 */
export default class jobjesStripeTracker {
    #paths;

    constructor() {
        this.#paths = [];
    }

    /**
     * Takes an item and adds it entirely, breaking down all of the necessary paths
     * @param {any} item the item to add
     * @param {any | undefined} [parent=undefined] item's immediate container
     * @returns The jobjesStripeTracker
     */
    explore(item, parent = undefined) {
        const inspect = (item, parent = undefined) => {
            // handle the specific item
            this.step(item, parent);

            // iterate through the item's children, with the item now as the parent for successive calls
            const keys = typeof item === 'object' ?
                Object.entries(item).map((set, index) => set[0]) :
                (Array.isArray(item) ? item.keys() :
                    []);

            keys.forEach((key, index) => {
                inspect(item[key], item);
            });
        }

        if (Array.isArray(item) || typeof item === 'object') {
            inspect(item, parent);
        } else {
            this.step(item, parent);
        }

        return this;
    }

    /**
     * Iterates over the entire structure again, ensuring that everything is accounted for
     */
    refresh() {
        this.#paths.forEach((path) => {
            this.explore(path.getAbs(0));
        });

        this.#consolidate();
    }

    /**
     * Takes an item and adds it to the most appropriate path
     * @param {any} item the item to add
     * @param {any} [parent=undefined] If provided, then the item added must come directly follow the given parent
     */
    step(item, parent = undefined) {
        if (this.#paths.length === 0) {
            const tracker = new jobjesPathTracker();
            tracker.step(item);

            this.#paths.push(tracker);
        } else {
            if (!!parent) {
                let options = [];
                for (let i = 0; i < this.#paths.length; i++) {
                    const path = this.#paths[i];

                    if (path.endsWith(parent)) {
                        options.push(path);
                    }
                }

                if (options.length > 0) {
                    // just use the first one because they are all the same
                    options[0].step(item);
                } else {
                    // if there are none that end in our parent, then check if there are any that have our parent at all
                    for (let i = 0; i < this.#paths.length; i++) {
                        const path = this.#paths[i];

                        const location = path.hasAt(parent);
                        if (location >= 0) {
                            // add one to the location to keep the parent and remove what's after it
                            options.push({ path: path, index: location + 1 });
                        }
                    }

                    if (options.length > 0) {
                        const option = options[0];
                        // copy the shared portion, terminate it at the parent, and add our new item to the end
                        const tracker = option.path.dupe().sheer(option.index);
                        tracker.step(item);

                        this.#paths.push(tracker);
                    }
                }
            } else {
                // roots that are already account for should not be reprocessed
                if (this.contains(item) === false) {
                    // if no parent is provided, we are adding a root
                    // if there already is a 1 item length that ends in the given item, we don't have to add anything
                    let options = [];
                    for (let i = 0; i < this.#paths.length; i++) {
                        const path = this.#paths[i];

                        if (path.endsWith(parent) && path.length === 1) {
                            options.push(path);
                        }
                    }

                    if (options.length === 0) {
                        const tracker = new jobjesPathTracker();
                        tracker.step(item);

                        this.#paths.push(tracker);
                    }
                }
            }
        }
    }

    /**
     * Returns the hierarchical ancestor of the given item, if found
     * @param {any} item The item to check for
     * @returns {any} item's direct ancestor in the hierarchy
     */
    ancestor(item) {
        let options = [];
        for (let i = 0; i < this.#paths.length; i++) {
            const path = this.#paths[i];

            const location = path.hasAt(item);
            const parent = path.getAbs(location - 1)
            if (location > 0 && options.includes(parent) === false) {
                options.push(parent);
            }
        }

        if (options.length === 1) {
            return options[0];
        } else if (options.length === 0) {
            return undefined;
        } else {
            return options;
        }
    }

    /**
     * Checks to see if the given item is accounted for
     * @param {any} item the item to check for
     * @returns {boolean} true, if found
     */
    contains(item) {
        let options = [];
        for (let i = 0; i < this.#paths.length; i++) {
            const path = this.#paths[i];

            if (path.has(item)) {
                options.push(path);
                break;
            }
        }

        return options.length > 0;
    }

    /**
     * Deletes the given item and everything after it in each tree it occurs in
     * @param {any} item the item to delete
     * @param {boolean} actual If true, actually deletes the target item from its structure
     * @returns {jobjesStripeTracker} The stripe tracker
     */
    delete(item, actual = false) {
        this.#paths.forEach((path) => {
            const location = path.hasAt(item);
            if (location >= 0) {
                if (actual === true) {
                    const parent = this.ancestor(item);
                    if (Array.isArray(parent)) {
                        parent.splice(parent.indexOf(item), 1);
                    } else if (typeof parent === 'object') {
                        // get the properties on the parent with the given item as their value
                        const keys = Object.entries(parent).filter((set) => set[1] === item).map((set) => set[0]);

                        // delete them
                        keys.forEach((key) => {
                            delete parent[key];
                        });
                    }
                }

                path.sheer(location);
            }
        });

        this.#consolidate();
        return this;
    }

    /**
     * Removes duplicates
     */
    #consolidate() {
        // loop through and note each unique path instance
        let kept = [];
        for (let checkedIndex = 0; checkedIndex < this.#paths.length; checkedIndex++) {
            const target = this.#paths[checkedIndex];

            if (kept.filter((compared) => compared.equality(target)).length === 0) {
                kept.push(target);
            }
        }

        // swap the paths arrays
        this.#paths = kept;
    }
}