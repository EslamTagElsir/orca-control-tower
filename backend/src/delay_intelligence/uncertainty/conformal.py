import numpy as np

class ConformalQuantileCalibrator:
    '''
    Performs Conformalized Quantile Regression (CQR) calibration.
    Learns the required empirical adjustment factor Q from a temporal calibration set.
    '''
    
    def __init__(self, alpha: float):
        '''
        Args:
            alpha (float): The target miscoverage rate (e.g., 0.1 for 90% coverage).
                           This means the lower quantile is alpha/2 and upper is 1 - alpha/2.
        '''
        self.alpha = alpha
        self.q_adjustment_ = None

    def fit(self, q_low_calib: np.ndarray, q_high_calib: np.ndarray, y_calib: np.ndarray):
        '''
        Calculates non-conformity scores and the empirical adjustment factor.
        
        Args:
            q_low_calib: Uncalibrated lower bound predictions on calibration set.
            q_high_calib: Uncalibrated upper bound predictions on calibration set.
            y_calib: True values of the calibration set.
        '''
        scores = np.maximum(q_low_calib - y_calib, y_calib - q_high_calib)
        n = len(scores)
        # We need the (1 - alpha) quantile of the non-conformity scores, adjusted for finite sample
        q_level = min(1.0, (1.0 - self.alpha) * (1.0 + 1.0 / n))
        self.q_adjustment_ = np.quantile(scores, q_level, method='higher')
        return self

    def predict(self, q_low_test: np.ndarray, q_high_test: np.ndarray):
        '''
        Applies the conformal adjustment to test predictions.
        '''
        if self.q_adjustment_ is None:
            raise ValueError("Calibrator is not fitted.")
            
        return q_low_test - self.q_adjustment_, q_high_test + self.q_adjustment_
