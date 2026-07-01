export const relationshipTypes = {
    direct: "direct", // immediate parent / child
    indirect: "indirect", // parent / child, but through a connection made by other objects
    any: "any", // used for searching
}

/**
 * This class takes object literals and builds hierarchical lookup dictionaries of them.  
 * This allows traversal through them in both directions.
 * 
 * Uses instance matching for lookups
 */
export class JobjeSHierarchyMonitor {
    #associations;
    #properties;
    #trackIndirect;

    #itemComparer = (obj1, obj2) => {
        return obj1 === obj2;
    }

    /**
     * Creates a JobjeSHierarchyMonitor intsance
     * @param {boolean} trackIndirect should indirect (the child relations of child relations, etc) be tracked?
     * @param {function} itemComparer Provided this function to override the default instance matching
     */
    constructor(trackIndirect = false, itemComparer) {
        this.#associations = [];
        this.#properties = [];
        this.#trackIndirect = trackIndirect;

        if (!!itemComparer && typeof itemComparer === 'function') {
            this.#itemComparer = itemComparer;
        }
    }

    // notes on how this works:
    // arrays can't be parents, 
    //      so when an object contains an array property, that entry will look like this:
    //             { child: <>, parent: <>, type: direct, via: <>, through: *array instance* }
    //          otherwise, it will be as follows:
    //             { child: <>, parent: <>, type: <>, via: <> }

    // properties that do not contribute to the hierarchy (i.e. normal properties that contain arrays or scalar values)
    // are stored in the #properties field.  These relationships can be deleted and queried, too

    /**
     * Iterates through and fully catalogs the given object
     * 
     * Note: the object can contain arrays, but can't be one
     * @param {object} obj The object literal to add
     */
    add(obj) {
        // iterate through the entire object, 
        //      add relationships (direct and indirect)
        let hierarchy = [];

        // recursively derives relationships (handles arrays)
        const getRelationSet = (item, listing, data, via, depth = [], through = undefined) => {
            // arrays cannot be parents, they are the value of the "through" property
            if (Array.isArray(item) === true) return;

            // note that the last item in depth is the current parent
            const currentParent = depth.length > 0 ? depth[depth.length - 1] : undefined;

            let relations = [];
            // add entries for this object, for each of the items in depth if via was provided
            // if via was not provided, then this is the root object and depth should be empty
            if (!!via && depth.length > 0) {
                if (this.#trackIndirect === true) {
                    depth.forEach((subParent) => {
                        if (this.#hasRelation(subParent, item, through, listing, data) === false) {
                            listing.push({
                                child: item,
                                parent: subParent,
                                type: subParent === currentParent ? relationshipTypes.direct : relationshipTypes.indirect,
                                via: subParent === currentParent ? via : undefined,
                                through: through
                            });
                        }
                    });
                } else {
                    if (this.#hasRelation(currentParent, item, through, listing, data) === false) {
                        listing.push({
                            child: item,
                            parent: currentParent,
                            type: relationshipTypes.direct,
                            via: via,
                            through: through
                        });
                    }
                }
            }

            // now add relationships for any children, to complete the roster
            Object.entries(item).forEach((set, index) => {
                if (Array.isArray(set[1]) && typeof set[1] !== 'string') {
                    // call again against each item in the array
                    set[1].forEach((aItem, index) => {
                        getRelationSet(aItem, listing, data, set[0], [...depth, item], set[1]);
                    });

                    // it's still a property                    
                    data.push({
                        container: item,
                        property: set[0],
                        type: relationshipTypes.direct
                    });
                } else if (typeof set[1] === 'object') {
                    getRelationSet(set[1], listing, data, set[0], [...depth, item]);

                    // it's still a property                    
                    data.push({
                        container: item,
                        property: set[0],
                        type: relationshipTypes.direct
                    });
                } else {
                    data.push({
                        container: item,
                        property: set[0],
                        type: relationshipTypes.direct
                    });
                }
            });
        }

        // we don't have to worry about duplicate property names because we store them in pairs, which are unique
        getRelationSet(obj, hierarchy, this.#properties, undefined, []);
        if (hierarchy.length > 0) {
            hierarchy.forEach((relation) => {
                if (this.#hasRelation(relation.parent, relation.child, relation.through, this.#associations) === false) {
                    this.#associations.push(relation);
                }
            })
        }
    }

    /**
     * Removes the object from the catalog
     * @param {object} obj The object literal to remove
     * @param {boolean} [remove=false] If true, deletes the association from the actual related objects
     */
    remove(obj, remove = false) {
        if (remove === true) {
            // handle direct containment
            const directMatches = this.#associations.filter((item) =>
                (this.#itemComparer(item.child, obj) || this.#itemComparer(item.parent, obj)) &&
                item.type === relationshipTypes.direct);

            directMatches.forEach((match) => {
                delete match.parent[match.via];
            });

            // handle arrays
            const throughMatches = this.#associations.filter((item) =>
                (this.#itemComparer(item.child, obj) || this.#itemComparer(item.parent, obj)) &&
                item.type === relationshipTypes.indirect &&
                !!item.through);

            throughMatches.forEach((match) => {
                match.through.splice(match.through.indexOf(obj), 1);
            });
        }
        this.#associations = this.#associations.filter((item) =>
            this.#itemComparer(item.child, obj) === false &&
            this.#itemComparer(item.parent, obj) === false);

        if (remove === true) {
            const directMatches = this.#properties.filter((item) => this.#itemComparer(item.container, obj));
            directMatches.forEach((match) => {
                delete match.container[match.property];
            });
        }
        this.#properties = this.#properties.filter((item) => this.#itemComparer(item.container, obj) === false);
    }

    /**
     * Looks to see if the given relationship is noted within the given array
     * @param {object} parent the parent to check for
     * @param {object} child the child to check for
     * @param {object} [through=undefined] the through (array) to check in
     * @param {Array} [listing=this.#associations] The relationship array to check in
     * @param {Array} [data=this.#properties] The property listing array to check in
     */
    #hasRelation(parent, child, through = undefined, listing = this.#associations, data = this.#properties) {
        let finds = undefined;
        if (Array.isArray(through)) {
            finds = listing.filter((item) =>
                this.#itemComparer(item.parent, parent) &&
                this.#itemComparer(item.child, child) &&
                this.#itemComparer(item.through, through));
        } else if (typeof child === 'object') {
            finds = listing.filter((item) =>
                this.#itemComparer(item.parent, parent) &&
                this.#itemComparer(item.child, child));
        } else {
            finds = data.filter((item) => this.#itemComparer(item.container, parent));
        }

        return finds.length > 0;
    }

    /**
     * Returns an array of the provided object's children
     * @param {object} obj The object literal whose children are to be retrieved
     * @param {string} type Use relationshipTypes to provide this value.  dictates what type of relationships to return
     * @returns All objects with a registered child connection to the given object
     */
    getChildren(obj, type = relationshipTypes.direct) {
        return this.#associations.filter((item) => {
            let matches = true;
            if (this.#itemComparer(item.child, obj) === false) {
                matches = false;
            }

            if (type !== relationshipTypes.any && item.type !== type) {
                matches = false;
            }

            return matches;
        });
    }

    /**
     * Returns an array of the provided object's parents
     * @param {object} obj The object literal whose parents are to be retrieved
     * @param {string} type Use relationshipTypes to provide this value.  dictates what type of relationships to return
     * @returns All objects with a registered parental connection to the given object
     */
    getParents(obj, type = relationshipTypes.direct) {
        return this.#associations.filter((item) => {
            let matches = true;
            if (this.#itemComparer(item.parent, obj) === false) {
                matches = false;
            }

            if (type !== relationshipTypes.any && item.type !== type) {
                matches = false;
            }

            return matches;
        });
    }

    /**
     * Queries for objects that have properties of the given name (either under the given parent or in the entire hierarchy)
     * @param {string} property Returns the objects that have properties of that name
     * @param {object} [parent=undefined] The object to look under (will accept direct and indirect)
     */
    getContainers(property, parent = undefined) {
        return this.#properties.filter((item) => {
            let matches = true;
            if (item.property !== property) {
                matches = false;
            }
            if (!!parent && item.container !== parent) {
                matches = false;
            }

            return matches;
        });
    }

    /**
     * Returns an array of the provided object's properties
     * @param {object} obj The object literal whose properties are to be retrieved
     */
    getProperties(obj) {
        return this.#properties.filter((item) => {
            let matches = true;
            if (this.#itemComparer(item.container, obj) === false) {
                matches = false;
            }

            return matches;
        });
    }

    /**
     * Ceases tracking of the given object and all relationships it is a part of
     * @param {object} obj The object to remove from the hierarchy
     * @param {boolean} [remove=false] If true, will delete the corresponding property from the actual objects
     */
    delObj(obj, remove = false) {
        const props = this.getProperties(obj);
        const parents = this.getParents(object, relationshipTypes.any);
        const children = this.getChildren(object, relationshipTypes.any);

        // iterate through and remove them all
        props.forEach((prop) => {
            const indexOf = this.#properties.indexOf(prop);
            this.#properties.splice(indexOf, 1);

            if (remove === true) {
                delete prop.container[prop.property];
            }
        });

        parents.forEach((parent) => {
            const indexOf = this.#associations.indexOf(parent);
            this.#associations.splice(indexOf, parent);

            if (remove === true) {
                if (!!parent.through && parent.child === obj) {
                    const throughIndexOf = parent.through.indexOf(obj);
                    parent.through.splice(throughIndexOf, 1);
                } else {
                    if (!!parent.via && parent.child === obj) {
                        delete parent.parent[parent.via];
                    }
                }
            }
        });

        children.forEach((child) => {
            const indexOf = this.#associations.indexOf(parent);
            this.#associations.splice(indexOf, parent);

            if (remove === true) {
                if (!!child.through && child.parent === obj) {
                    const throughIndexOf = child.through.indexOf(child.child);
                    child.through.splice(throughIndexOf, 1);
                } else {
                    if (!!parent.via && child.parent === obj) {
                        delete child.parent[parent.via];
                    }
                }
            }
        });
    }

    /**
     * Ceases tracking of the given child in relation to the given parent
     * @param {object} parent The parent to remove the child from
     * @param {object} child The child to remove
     * @param {boolean} [remove=false] If true, will delete the corresponding property from the actual objects
     */
    delChild(parent, child, remove = false) {
        const parents = 
            this.getParents(child, relationshipTypes.any)
            .filter((relation) => relation.parent === parent);

        parents.forEach((parent) => {
            const indexOf = this.#associations.indexOf(parent);
            this.#associations.splice(indexOf, parent);

            if (remove === true) {
                if (!!parent.through && parent.child === child) {
                    const throughIndexOf = parent.through.indexOf(child);
                    parent.through.splice(throughIndexOf, 1);
                } else {
                    if (!!parent.via && parent.child === child) {
                        delete parent.parent[parent.via];
                    }
                }
            }
        });
    }

    /**
     * Ceases tracking of the named property on the given object in the tracking system
     * @param {object} parent The object to delete the property from
     * @param {string} property The property to delete
     * @param {boolean} [remove=false] If true, will delete the corresponding property from the actual objects
     */
    delProperty(parent, property, remove = false) {
        const props = 
            this.getProperties(parent)
            .filter((prop) => prop.property === property);
        
        props.forEach((prop) => {
            const indexOf = this.#properties.indexOf(prop);
            this.#properties.splice(indexOf, 1);

            if (remove === true) {
                delete prop.container[prop.property];
            }
        });
    }
}