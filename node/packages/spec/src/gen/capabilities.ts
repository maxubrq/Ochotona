// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

import type { CapabilityRange } from '../types';

export const CAPABILITY_RANGES = [
  {
    from: '3.13.0',
    to: '4.0.0',
    caps: {
      retry: {
        mechanism: 'dlx_ttl_tiers',
        transientFailure: 'reject_requeue_false',
        mainQueueDeadLetter: 'ocho.retry',
      },
      nackCountsTowardDeliveryLimit: true,
      consumerTimeoutScope: 'channel',
      mirroredClassicQueues: 'available',
      metadataStores: ['mnesia'],
      metadataDefault: 'mnesia',
      defaults: {
        classic: { overflow: 'drop-head' },
        quorum: {
          overflow: 'drop-head',
          deadLetterStrategy: 'at-most-once',
          deliveryLimit: null,
        },
      },
      ochoSets: { deliveryLimit: 10 },
      endpoints: { deprecatedFeaturesUsed: true, vhostDefaultQueueType: true },
      statsOffLists: {
        connections: 'listed',
        channels: 'rejected',
        consumers: 'rejected',
      },
    },
  },
  {
    from: '4.0.0',
    to: '4.2.0',
    caps: {
      retry: {
        mechanism: 'dlx_ttl_tiers',
        transientFailure: 'reject_requeue_false',
        mainQueueDeadLetter: 'ocho.retry',
      },
      nackCountsTowardDeliveryLimit: true,
      consumerTimeoutScope: 'channel',
      mirroredClassicQueues: 'removed',
      metadataStores: ['mnesia', 'khepri'],
      metadataDefault: 'mnesia',
      defaults: {
        classic: { overflow: 'drop-head' },
        quorum: {
          overflow: 'drop-head',
          deadLetterStrategy: 'at-most-once',
          deliveryLimit: 20,
        },
      },
      ochoSets: { deliveryLimit: 10 },
      endpoints: { deprecatedFeaturesUsed: true, vhostDefaultQueueType: true },
      statsOffLists: {
        connections: 'listed',
        channels: 'rejected',
        consumers: 'rejected',
      },
    },
  },
  {
    from: '4.2.0',
    to: '4.3.0',
    caps: {
      retry: {
        mechanism: 'dlx_ttl_tiers',
        transientFailure: 'reject_requeue_false',
        mainQueueDeadLetter: 'ocho.retry',
      },
      nackCountsTowardDeliveryLimit: true,
      consumerTimeoutScope: 'channel',
      mirroredClassicQueues: 'removed',
      metadataStores: ['mnesia', 'khepri'],
      metadataDefault: 'khepri',
      defaults: {
        classic: { overflow: 'drop-head' },
        quorum: {
          overflow: 'drop-head',
          deadLetterStrategy: 'at-most-once',
          deliveryLimit: 20,
        },
      },
      ochoSets: { deliveryLimit: 10 },
      endpoints: { deprecatedFeaturesUsed: true, vhostDefaultQueueType: true },
      statsOffLists: {
        connections: 'listed',
        channels: 'rejected',
        consumers: 'rejected',
      },
    },
  },
  {
    from: '4.3.0',
    caps: {
      retry: {
        mechanism: 'quorum_delayed_retry',
        transientFailure: 'reject_requeue_true',
        mainQueueDeadLetter: 'ocho.parking',
      },
      nackCountsTowardDeliveryLimit: false,
      consumerTimeoutScope: 'consumer',
      mirroredClassicQueues: 'removed',
      metadataStores: ['khepri'],
      metadataDefault: 'khepri',
      defaults: {
        classic: { overflow: 'drop-head' },
        quorum: {
          overflow: 'drop-head',
          deadLetterStrategy: 'at-most-once',
          deliveryLimit: 20,
        },
      },
      ochoSets: { deliveryLimit: 10 },
      endpoints: { deprecatedFeaturesUsed: true, vhostDefaultQueueType: true },
      statsOffLists: {
        connections: 'empty',
        channels: 'empty',
        consumers: 'rejected',
      },
    },
  },
] as const satisfies readonly CapabilityRange[];
