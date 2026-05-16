# JobjeS

## Introduction
JobjeS is short for JavaScript Object Search.
 
## Usage
This library allows regular expression like queries to be executed against an arbitrary array or object literal structure and return any items that match the query.
 
There are three key terms in the way queries are executed:
* Selects:
    * A select is anything that moves the context forward.  This is limited to paths. (i.e. sequences of references to properties, termed keys, within the structure)

    * e.g. given the object `{ set: [ 1, 2, 3, 4 ], id: 'first' }` `set` and `id` are keys in the immediate context.  So are `1`, `2`, `3`, and `4` within the context of the array under `'set'`.
* Conditions:
    * A condition is anything that is used to filter results.  

    * They come in two forms:
        * Full:
            * A full condition is a key followed by a divider (default ':') and then a value item.  (more on that later).  

            * When executing a full condition, the value item is evaluated against the content of the given key without altering the context.
        * Nested:
            * A nested condition is a value item, whether following an operator or separator.  (more on those later).

            * When executing a nested condition, the value item is evaluated against the current context.
         
    * All conditions limit the context of operations that follow them, but do not act as selects.
* Parentheticals:
    * A parenthetical, i.e. operations within parenthesis, executes under the originating context, but any changes it makes to context are limited in scope to it.  This means that any selects that occur within it are forgotten when leaving the parenthesis.

    * Parentheticals can be nested "infinitely".  Heaps do exist.

## Definitions
Below are the selects within the system:
* `<key>` : 
    * any direct reference to a property name is termed a `"key"`, and will only match that key.  Within the current context, this will move the execution context to the content of that key.  Meaning that given the structure, `{ set: [ 1, 2, 3, 4 ], id: 'first' }`, the key `'set'` will result in the context moving to the array under set.  i.e. `[ 1, 2, 3, 4 ]`.

*     `\*` : 
    * This select matches "any" key.  Meaning, within the structure, `{ set: [ 1, 2, 3, 4 ], id: 'first' }`, the `*` select would match the content of both `'set'` and `'id'`.
 
*     `\*\*`: 
    * This select atches "any and all".  It does the same thing as `*`, but to every possible depth, traversing the entire structure and executing subsequent query details against each sub item.  Obviously, this is massively costly in terms of relative execution time, especially in large structures.
 
Below are the value items within the system:
* Note that all definitions below are full conditions.  To convert them into nested conditions, simply remove the key and divider (default ':').
 
* `<key>:!!` : 
    * exists, checks to see if the given `<key>` is defined on the object
 
*  `<key>:!` : 
    * does not exist, checks to see if the given `<key>` is not defined on the object. (never matches as a nested, because the context must exist prior to it getting evaluated)
 
* `<key>:!!<value>` : 
    * positive value, checks to see if the given `<key>` has the given value
 
* `<key>:!<value>` : 
    * negative value, checks to see if the given `<key>` does not have the given value
 
* `<key>:/regexp/` : 
    * regular expression, checks to see if the given `<key>`'s value matches the regular expression
 
To connect conditions and parentheticals, operators can be used.  The following operators are supported:
* `&&` : Ensures that all conditions / parentheticals in the chain evaluate as true.
* `||` : Ensures that at least one of the conditions / parentheticals in the chain evaluate as true.
 
# Note for usage
When using this system, context is massively important.  If the results you get aren't what you expected, consider context.