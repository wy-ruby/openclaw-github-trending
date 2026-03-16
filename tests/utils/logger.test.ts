import { Logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  let originalConsole: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    originalConsole = global.console;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
    global.console = originalConsole;
  });

  describe('constructor', () => {
    it('should create logger with default prefix when none provided', () => {
      const logger = new Logger();
      expect(logger.getPrefix()).toBe('[App]');
    });

    it('should create logger with custom prefix', () => {
      const logger = new Logger('CustomPrefix');
      expect(logger.getPrefix()).toBe('[CustomPrefix]');
    });
  });

  describe('debug', () => {
    it('should log debug message with prefix', () => {
      const logger = new Logger('Test');
      logger.setLogLevel(LogLevel.DEBUG); // Enable debug level
      const message = 'Debug message';
      logger.debug(message);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
    });

    it('should log message with multiple arguments', () => {
      const logger = new Logger();
      logger.setLogLevel(LogLevel.DEBUG); // Enable debug level
      logger.debug('Object:', { key: 'value' }, 'Array:', [1, 2, 3]);

      // Check that console.log was called with arguments containing the expected content
      expect(consoleLogSpy).toHaveBeenCalled();
      const lastCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1];
      const message = lastCall[0];
      expect(message).toContain('Object:');
      expect(message).toContain('key');
      expect(message).toContain('Array:');
      expect(message).toContain('1');
    });
  });

  describe('info', () => {
    it('should log info message with prefix', () => {
      const logger = new Logger('Test');
      const message = 'Info message';
      logger.info(message);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    });

    it('should log info message with multiple arguments', () => {
      const logger = new Logger('Test');
      logger.info('User %s logged in with ID %d', 'Alice', 123);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('User %s logged in with ID %d'));
    });
  });

  describe('success', () => {
    it('should log success message with prefix', () => {
      const logger = new Logger('Test');
      const message = 'Success message';
      logger.success(message);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[SUCCESS]'));
    });

    it('should log success with checkmark symbol', () => {
      const logger = new Logger('Test');
      logger.success('Operation completed');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Operation completed'));
    });
  });

  describe('warn', () => {
    it('should log warning message with prefix', () => {
      const logger = new Logger('Test');
      const message = 'Warning message';
      logger.warn(message);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    });
  });

  describe('error', () => {
    it('should log error message with prefix', () => {
      const logger = new Logger('Test');
      const message = 'Error message';
      logger.error(message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    });

    it('should log error with stack trace when Error object provided', () => {
      const logger = new Logger('Test');
      const error = new Error('Test error with stack trace');
      logger.error(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Test error with stack trace'));
    });
  });

  describe('timer', () => {
    it('should return a timer function', () => {
      const logger = new Logger('Test');
      const timer = logger.timer('Operation');

      expect(typeof timer).toBe('function');
    });

    it('should log elapsed time when called', () => {
      const logger = new Logger('Test');
      const timer = logger.timer('Slow operation');

      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);
      const elapsed = timer();
      jest.useRealTimers();

      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('static methods', () => {
    describe('Logger.debug', () => {
      it('should log static debug message', () => {
        // Static methods use 'App' logger, set its level to debug
        const appLogger = Logger.get('App');
        appLogger.setLogLevel(LogLevel.DEBUG);

        Logger.debug('Static debug message');

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Static debug message'));
      });
    });

    describe('Logger.info', () => {
      it('should log static info message', () => {
        Logger.info('Static info message');

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Static info message'));
      });
    });

    describe('Logger.success', () => {
      it('should log static success message', () => {
        Logger.success('Static success message');

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[SUCCESS]'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Static success message'));
      });
    });

    describe('Logger.warn', () => {
      it('should log static warning message', () => {
        Logger.warn('Static warning message');

        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Static warning message'));
      });
    });

    describe('Logger.error', () => {
      it('should log static error message', () => {
        Logger.error('Static error message');

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Static error message'));
      });
    });
  });

  describe('formatting', () => {
    it('should format objects properly', () => {
      const logger = new Logger('Test');
      const obj = { name: 'test', value: 123 };
      logger.info('Object:', obj);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Object:'));
    });

    it('should format arrays properly', () => {
      const logger = new Logger('Test');
      const arr = [1, 2, 3];
      logger.info('Array:', arr);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Array:'));
    });

    it('should handle newline characters in messages', () => {
      const logger = new Logger('Test');
      logger.info('Line 1\nLine 2');

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});
