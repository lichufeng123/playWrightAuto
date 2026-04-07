interface Person {
    readonly name:string;
    age?:number;
    [propName:string]:any;
}
let tom: Person = {
    name:'Tom',
    age:25
}

let fibonacci:number [] = [1,1,2,3,5];
