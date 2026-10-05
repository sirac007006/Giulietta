import { estimateGear } from '../src/gear';

describe('estimateGear', () => {
  it('N kad auto stoji', () => expect(estimateGear(0, 820)).toBe('N'));
  it('null bez podataka', () => expect(estimateGear(null, 2000)).toBeNull());
  it('prepoznaje stepen iz odnosa brzine i obrtaja', () => {
    expect(estimateGear(32.5 * 2, 2000)).toBe(4); // 65 km/h na 2000 o/min
    expect(estimateGear(8.2 * 1.5, 1500)).toBe(1);
    expect(estimateGear(49.5 * 2.6, 2600)).toBe(6);
  });
  it('null kad odnos ne odgovara nijednom stepenu (kvačilo)', () => expect(estimateGear(60, 900)).toBeNull());
});
