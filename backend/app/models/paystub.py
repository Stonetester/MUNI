from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Paystub(Base):
    """Parsed paystub data — tuned for Paylocity format, works for others too."""
    __tablename__ = "paystubs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Header
    employer = Column(String, nullable=True)
    voucher_number = Column(String, nullable=True)
    pay_date = Column(Date, nullable=False)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)

    # Earnings (current period)
    gross_pay = Column(Float, nullable=True)
    regular_pay = Column(Float, nullable=True)
    holiday_pay = Column(Float, nullable=True, default=0.0)
    overtime_pay = Column(Float, nullable=True, default=0.0)
    salary_per_period = Column(Float, nullable=True)       # base salary this period
    fed_taxable_income = Column(Float, nullable=True)

    # Employer 401k Safe Harbor (the 6% employer contribution)
    employer_401k = Column(Float, nullable=True, default=0.0)

    # Taxes (current period)
    tax_federal = Column(Float, nullable=True, default=0.0)   # FITW
    tax_state = Column(Float, nullable=True, default=0.0)     # MD
    tax_county = Column(Float, nullable=True, default=0.0)    # MD-CAL1
    tax_social_security = Column(Float, nullable=True, default=0.0)   # SS
    tax_medicare = Column(Float, nullable=True, default=0.0)          # MED
    tax_total = Column(Float, nullable=True, default=0.0)

    # Employee deductions (current period)
    deduction_401k = Column(Float, nullable=True, default=0.0)
    deduction_dental = Column(Float, nullable=True, default=0.0)
    deduction_vision = Column(Float, nullable=True, default=0.0)
    deduction_life_insurance = Column(Float, nullable=True, default=0.0)   # GTL + VLIFE
    deduction_ad_and_d = Column(Float, nullable=True, default=0.0)
    deduction_std_ltd = Column(Float, nullable=True, default=0.0)          # ER STD/LTD
    deduction_total = Column(Float, nullable=True, default=0.0)

    # Net pay
    net_pay = Column(Float, nullable=True)

    # YTD figures
    ytd_gross = Column(Float, nullable=True)
    ytd_net = Column(Float, nullable=True)
    ytd_401k_employee = Column(Float, nullable=True)
    ytd_401k_employer = Column(Float, nullable=True)
    ytd_federal_tax = Column(Float, nullable=True)
    ytd_state_tax = Column(Float, nullable=True)
    ytd_ss = Column(Float, nullable=True)
    ytd_medicare = Column(Float, nullable=True)
    ytd_taxes_total = Column(Float, nullable=True)

    # Meta
    raw_pdf_path = Column(String, nullable=True)
    parse_method = Column(String, nullable=True, default="pdfplumber")   # pdfplumber | tesseract | manual
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
