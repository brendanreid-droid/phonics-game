import { MemoryProfileRepo } from './MemoryProfileRepo';
import { describeProfileRepo } from './profileRepoContract';

describeProfileRepo('MemoryProfileRepo', () => new MemoryProfileRepo());
