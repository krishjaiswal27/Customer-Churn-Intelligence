SELECT 
    contract,
    COUNT(*) as total_customers,
    SUM(churn_value) as churned,
    ROUND(SUM(churn_value) * 100.0 / COUNT(*), 1) as churn_rate
FROM features
GROUP BY contract
ORDER BY churn_rate DESC;

SELECT 
    tenure_bucket,
    COUNT(*) as total_customers,
    SUM(churn_value) as churned,
    ROUND(SUM(churn_value) * 100.0 / COUNT(*), 1) as churn_rate
FROM features
GROUP BY tenure_bucket
ORDER BY churn_rate DESC;

SELECT 
    spend_tier,
    COUNT(*) as total_customers,
    SUM(churn_value) as churned,
    ROUND(SUM(churn_value) * 100.0 / COUNT(*), 1) as churn_rate
FROM features
GROUP BY spend_tier
ORDER BY churn_rate DESC;