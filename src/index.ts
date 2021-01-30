import { spawn } from 'child_process';
import { Observable, Subscriber } from 'rxjs';
import { StringDecoder } from 'string_decoder';

const COMMAND = 'iftop';
const ARGS = ['-pBtnNPlL', '300'];

interface Sizes {
  last2Seconds: number;
  last10Seconds: number;
  last40Seconds: number;
  cumulative: number;
}

interface MyType {
  outIP: string;
  outPort: number;
  inIp: string;
  inPort: number;
  inSize: Sizes;
  outSize: Sizes;
}

const multipliers: { [key: string]: number } = {
  B: 1,
  K: 1024,
  M: 1024 * 1024,
  G: 1024 * 1024 * 1024,
  T: 1024 * 1024 * 1024 * 1024,
};

const regEx = new RegExp(/(\d+\.\d+\.\d+\.\d+):(\d+)\s+([<=>]+)\s+(\d+[BKMG])\s+(\d+[BKMG])\s+(\d+[BKMG])\s+(\d+[BKMG])$/);
const numGroups = 8;
const ipGroup = 1;
const portGroup = 2;
const directionGroup = 3;
const last2Group = 4;
const last10Group = 5;
const last40Group = 6;
const cumGroup = 7;

function getSize(count: string) {
  const multiplier = count.substring(count.length);
  count = count.substring(0, count.length - 1);
  const toMultiplyBy = Number(multipliers[multiplier] || 1);
  const value = Number(count) * toMultiplyBy;
  //console.log('size = ', count, multiplier, toMultiplyBy, value);
  return value;
}

function makeSizes(groups: string[]): Sizes {
  return {
    last2Seconds: getSize(groups[last2Group]),
    last10Seconds: getSize(groups[last10Group]),
    last40Seconds: getSize(groups[last40Group]),
    cumulative: getSize(groups[cumGroup]),
  };
}

function startIftop() {
  return new Observable((subscriber: Subscriber<MyType>) => {
    const iftop = spawn(COMMAND, ARGS);
    const decoder = new StringDecoder('utf8');
    iftop.stdout.on('data', (buffer) => {
      const data: string[] = decoder.write(buffer).split('\n');

      let json: Partial<MyType> = {};
      data.forEach((line: string) => {
        const groups = regEx.exec(line);

        if (groups && groups.length == 8) {
          switch (groups[directionGroup]) {
            case '=>':
              json = {
                outIP: groups[ipGroup],
                outPort: Number(groups[portGroup]),
                outSize: makeSizes(groups),
              };
              break;
            case '<=':
              json.inIp = groups[ipGroup];
              json.inPort = Number(groups[portGroup]);
              json.inSize = makeSizes(groups);
              subscriber.next(<MyType>json);
              json = {};
              break;
            default:
              console.warn('Unknown direction ' + groups[directionGroup], line);
          }
        }
      });
    });
    iftop.stderr.on('data', (data) => {
      console.log('****', data.toString());
    });
    iftop.on('exit', () => {
      console.log('Quitting');
      subscriber.complete();
    });
  });
}
startIftop().subscribe(
  (data) => {
    console.log(data);
  },
  () => {},
  () => {}
);