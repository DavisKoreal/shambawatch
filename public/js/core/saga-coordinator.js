/**
 * Shamba Watch 2.0 — Saga Coordinator
 * Adheres to Rule 47 (Saga Pattern) and Rule 18 (Explicit Exception Handling).
 * Coordinates multi-step asynchronous transactions and executes compensating actions if any step fails.
 */

import { StructuredLogger } from './structured-logger.js';
import { generateTraceId } from '../contracts/service-envelope.js';

export const SagaStatus = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  COMPENSATED: 'COMPENSATED',
  FAILED: 'FAILED'
});

export class SagaCoordinator {
  /**
   * @param {string} [name='DefaultSaga']
   */
  constructor(name = 'DefaultSaga') {
    this._name = name;
    this._steps = [];
    this._logger = new StructuredLogger(`SagaCoordinator:${name}`);
  }

  /**
   * Adds a step to the saga.
   * @param {Object} step
   * @param {string} step.name
   * @param {(context: Object) => Promise<any>} [step.action]
   * @param {(context: Object) => Promise<any>} [step.execute]
   * @param {(context: Object) => Promise<void>} [step.compensate]
   */
  addStep(step) {
    this._steps.push({
      name: step.name,
      execute: step.action || step.execute,
      compensate: step.compensate
    });
    return this;
  }

  /**
   * Executes the registered steps of this saga instance.
   * @param {Object} [initialContext={}]
   * @returns {Promise<{ status: string, success: boolean, context: Object, error?: Error }>}
   */
  async execute(initialContext = {}) {
    const res = await this.executeSaga(this._name, this._steps, initialContext);
    return {
      status: res.success ? SagaStatus.COMPLETED : SagaStatus.COMPENSATED,
      ...res
    };
  }

  /**
   * Executes a multi-step saga definition with rollback compensation on failure.
   * @template T
   * @param {string} sagaName
   * @param {Array<{
   *   name: string,
   *   execute: (context: Object) => Promise<any>,
   *   compensate?: (context: Object) => Promise<void>
   * }>} steps
   * @param {Object} [initialContext={}]
   * @returns {Promise<{ success: boolean, context: Object, error?: Error }>}
   */
  async executeSaga(sagaName, steps, initialContext = {}) {
    const sagaId = generateTraceId('saga');
    const logger = this._logger.withContext(sagaId);
    logger.info(`Starting Saga [${sagaName}] with ${steps.length} steps.`);

    const context = { ...initialContext, sagaId, sagaName };
    const executedSteps = [];

    for (const step of steps) {
      try {
        logger.debug(`Executing Saga step: ${step.name}`);
        const execFn = step.action || step.execute;
        const result = await execFn(context);
        if (result && typeof result === 'object') {
          Object.assign(context, result);
        }
        executedSteps.push(step);
      } catch (err) {
        logger.error(`Step [${step.name}] failed: ${err.message}. Triggering compensating rollback!`);

        // Execute compensating actions in reverse order
        for (let i = executedSteps.length - 1; i >= 0; i--) {
          const compStep = executedSteps[i];
          if (typeof compStep.compensate === 'function') {
            try {
              logger.info(`Rolling back step: ${compStep.name}`);
              await compStep.compensate(context);
            } catch (compErr) {
              logger.error(`Critical: Compensation failed for step [${compStep.name}]:`, compErr);
            }
          }
        }

        return {
          success: false,
          context,
          error: err
        };
      }
    }

    logger.info(`Saga [${sagaName}] completed successfully.`);
    return {
      success: true,
      context
    };
  }
}
